package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type IngestionJob struct {
	ItemID   string `json:"item_id"`
	FilePath string `json:"file_path"`
	Format   string `json:"format"`
}

type EmbedRequest struct {
	Text string `json:"text"`
}

type EmbedResponse struct {
	Embedding []float32 `json:"embedding"`
	Dimension int       `json:"dimension"`
}

func main() {
	log.Println("Ingestion Worker starting...")

	// Database connection
	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		getEnv("DB_USER", "csedu_user"),
		getEnv("DB_PASSWORD", "changeme_in_dev"),
		getEnv("DB_HOST", "postgres"),
		getEnv("DB_PORT", "5432"),
		getEnv("DB_NAME", "csedu_platform"),
	)

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer pool.Close()

	// Redis connection
	redisURL := getEnv("REDIS_URL", "redis://redis:6379")
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Invalid Redis URL: %v", err)
	}

	rdb := redis.NewClient(opt)
	defer rdb.Close()

	// RAG service URL
	ragURL := getEnv("RAG_SERVICE_URL", "http://rag:8001")

	log.Println("Ingestion Worker ready. Listening for jobs...")

	// Process jobs from Redis queue
	ctx := context.Background()
	for {
		// BLPOP blocks until a job is available
		result, err := rdb.BLPop(ctx, 0, "ingestion_queue").Result()
		if err != nil {
			log.Printf("Redis error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		if len(result) < 2 {
			continue
		}

		jobData := result[1]
		var job IngestionJob
		if err := json.Unmarshal([]byte(jobData), &job); err != nil {
			log.Printf("Invalid job data: %v", err)
			continue
		}

		log.Printf("Processing job: item_id=%s, file=%s", job.ItemID, job.FilePath)

		// Process the document
		if err := processDocument(ctx, pool, ragURL, job); err != nil {
			log.Printf("Error processing document %s: %v", job.ItemID, err)
			// Update status to failed
			updateIngestionStatus(ctx, pool, job.ItemID, "failed", err.Error())
		} else {
			log.Printf("Successfully processed document %s", job.ItemID)
			updateIngestionStatus(ctx, pool, job.ItemID, "completed", "")
		}
	}
}

func processDocument(ctx context.Context, pool *pgxpool.Pool, ragURL string, job IngestionJob) error {
	// Update status to processing
	updateIngestionStatus(ctx, pool, job.ItemID, "processing", "")

	// Extract text from document
	text, err := extractText(job.FilePath, job.Format)
	if err != nil {
		return fmt.Errorf("text extraction failed: %w", err)
	}

	if strings.TrimSpace(text) == "" {
		return fmt.Errorf("no text extracted from document")
	}

	log.Printf("Extracted %d characters from %s", len(text), job.ItemID)

	// Chunk the text
	chunks := chunkText(text, 512, 50)
	log.Printf("Created %d chunks for %s", len(chunks), job.ItemID)

	// Generate embeddings and store
	for i, chunk := range chunks {
		embedding, err := generateEmbedding(ragURL, chunk)
		if err != nil {
			return fmt.Errorf("embedding generation failed for chunk %d: %w", i, err)
		}

		// Store in database
		if err := storeEmbedding(ctx, pool, job.ItemID, i, chunk, embedding); err != nil {
			return fmt.Errorf("failed to store chunk %d: %w", i, err)
		}
	}

	return nil
}

func extractText(filePath, format string) (string, error) {
	// For PDF files, use PyMuPDF (fitz) via Python
	if format == "pdf" {
		return extractPDFText(filePath)
	}

	// For other formats, return placeholder
	// In production, add support for DOCX, PPTX, etc.
	return "", fmt.Errorf("unsupported format: %s", format)
}

func extractPDFText(filePath string) (string, error) {
	// Python script to extract text using PyMuPDF
	pythonScript := `
import sys
import fitz  # PyMuPDF

def extract_text(pdf_path):
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text()
    return text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract.py <pdf_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    text = extract_text(pdf_path)
    print(text)
`

	// Write script to temp file
	tmpFile, err := os.CreateTemp("", "extract_*.py")
	if err != nil {
		return "", err
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(pythonScript); err != nil {
		return "", err
	}
	tmpFile.Close()

	// Execute Python script
	cmd := exec.Command("python3", tmpFile.Name(), filePath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("python execution failed: %w, output: %s", err, string(output))
	}

	return string(output), nil
}

func chunkText(text string, chunkSize, overlap int) []string {
	// Simple word-based chunking
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{}
	}

	chunks := []string{}
	start := 0

	for start < len(words) {
		end := start + chunkSize
		if end > len(words) {
			end = len(words)
		}

		chunk := strings.Join(words[start:end], " ")
		chunks = append(chunks, chunk)

		// Move forward with overlap
		start += chunkSize - overlap
		if start >= len(words) {
			break
		}
	}

	return chunks
}

func generateEmbedding(ragURL, text string) ([]float32, error) {
	reqBody := EmbedRequest{Text: text}
	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	resp, err := http.Post(ragURL+"/embed", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("RAG service error: %s", string(body))
	}

	var embedResp EmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&embedResp); err != nil {
		return nil, err
	}

	return embedResp.Embedding, nil
}

func storeEmbedding(ctx context.Context, pool *pgxpool.Pool, itemID string, chunkIndex int, chunkText string, embedding []float32) error {
	// Convert []float32 to pgvector format
	embeddingStr := fmt.Sprintf("[%s]", strings.Trim(strings.Join(strings.Fields(fmt.Sprint(embedding)), ","), "[]"))

	query := `
		INSERT INTO vector_embeddings (item_id, chunk_index, chunk_text, embedding)
		VALUES ($1, $2, $3, $4::vector)
		ON CONFLICT (item_id, chunk_index) DO UPDATE
		SET chunk_text = EXCLUDED.chunk_text,
		    embedding = EXCLUDED.embedding
	`

	_, err := pool.Exec(ctx, query, itemID, chunkIndex, chunkText, embeddingStr)
	return err
}

func updateIngestionStatus(ctx context.Context, pool *pgxpool.Pool, itemID, status, errorMsg string) {
	// Create ingestion_status table if needed (should be in schema)
	// For now, just log
	log.Printf("Ingestion status for %s: %s (error: %s)", itemID, status, errorMsg)

	// Optionally update media_items or create separate ingestion_jobs table
	// This is a simplified version
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
