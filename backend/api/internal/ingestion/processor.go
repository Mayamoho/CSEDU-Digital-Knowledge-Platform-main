package ingestion

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

type Processor struct {
	db     *pgxpool.Pool
	redis  *redis.Client
	ragURL string
}

type IngestionJob struct {
	ItemID    string `json:"item_id"`
	FilePath  string `json:"file_path"`
	Format    string `json:"format"`
	UserID    string `json:"user_id"`
	Timestamp string `json:"timestamp"`
}

type Chunk struct {
	Index int    `json:"index"`
	Text  string `json:"text"`
}

type EmbedRequest struct {
	Text string `json:"text"`
}

type EmbedResponse struct {
	Embedding []float32 `json:"embedding"`
}

func NewProcessor(db *pgxpool.Pool, redis *redis.Client) *Processor {
	ragURL := os.Getenv("RAG_SERVICE_URL")
	if ragURL == "" {
		ragURL = "http://rag:8001"
	}
	return &Processor{db: db, redis: redis, ragURL: ragURL}
}

func (p *Processor) ProcessJob(ctx context.Context, jobData string) error {
	var job IngestionJob
	if err := json.Unmarshal([]byte(jobData), &job); err != nil {
		return fmt.Errorf("failed to parse job: %w", err)
	}

	log.Printf("Processing ingestion job for item %s", job.ItemID)

	// Update status to processing
	_ = p.updateIngestionStatus(ctx, job.ItemID, "processing")

	// 1. Extract text from file
	text, err := p.extractText(ctx, job.FilePath, job.Format)
	if err != nil {
		_ = p.updateIngestionStatus(ctx, job.ItemID, "failed")
		return fmt.Errorf("text extraction failed: %w", err)
	}

	if strings.TrimSpace(text) == "" {
		_ = p.updateIngestionStatus(ctx, job.ItemID, "failed")
		return fmt.Errorf("extracted text is empty for item %s", job.ItemID)
	}

	// 2. Chunk the text
	chunks := p.chunkText(text, 512, 50)
	if len(chunks) == 0 {
		_ = p.updateIngestionStatus(ctx, job.ItemID, "failed")
		return fmt.Errorf("no chunks generated for item %s", job.ItemID)
	}

	// 3. Generate embeddings via RAG service and store in pgvector
	if err := p.storeEmbeddings(ctx, job.ItemID, chunks); err != nil {
		_ = p.updateIngestionStatus(ctx, job.ItemID, "failed")
		return fmt.Errorf("embedding storage failed: %w", err)
	}

	// 4. Update ingestion status
	if err := p.updateIngestionStatus(ctx, job.ItemID, "completed"); err != nil {
		return fmt.Errorf("status update failed: %w", err)
	}

	log.Printf("Successfully processed item %s: %d chunks", job.ItemID, len(chunks))
	return nil
}

func (p *Processor) extractText(ctx context.Context, filePath, format string) (string, error) {
	switch format {
	case "pdf":
		return p.extractPDFText(ctx, filePath)
	case "txt":
		return p.extractPlainText(ctx, filePath)
	case "docx", "doc":
		return p.extractDocxText(ctx, filePath)
	default:
		return "", fmt.Errorf("unsupported format for text extraction: %s", format)
	}
}

func (p *Processor) extractPDFText(ctx context.Context, filePath string) (string, error) {
	// Use PyMuPDF via Python subprocess for PDF text extraction
	script := fmt.Sprintf(`
import fitz
doc = fitz.open("%s")
text = ""
for page in doc:
    text += page.get_text()
doc.close()
print(text)
`, filePath)

	cmd := exec.CommandContext(ctx, "python3", "-c", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("python3 PyMuPDF extraction failed: %w: %s", err, stderr.String())
	}

	return stdout.String(), nil
}

func (p *Processor) extractPlainText(ctx context.Context, filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read text file: %w", err)
	}
	return string(data), nil
}

func (p *Processor) extractDocxText(ctx context.Context, filePath string) (string, error) {
	// Use python-docx for DOCX text extraction
	script := fmt.Sprintf(`
from docx import Document
doc = Document("%s")
text = "\\n".join([p.text for p in doc.paragraphs])
print(text)
`, filePath)

	cmd := exec.CommandContext(ctx, "python3", "-c", script)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("python3 docx extraction failed: %w: %s", err, stderr.String())
	}

	return stdout.String(), nil
}

func (p *Processor) chunkText(text string, chunkSize, overlap int) []Chunk {
	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}

	var chunks []Chunk
	step := chunkSize - overlap
	if step <= 0 {
		step = chunkSize
	}

	for i := 0; i < len(words); i += step {
		end := i + chunkSize
		if end > len(words) {
			end = len(words)
		}

		chunk := strings.Join(words[i:end], " ")
		if strings.TrimSpace(chunk) != "" {
			chunks = append(chunks, Chunk{
				Index: len(chunks),
				Text:  chunk,
			})
		}

		if end >= len(words) {
			break
		}
	}

	return chunks
}

func (p *Processor) storeEmbeddings(ctx context.Context, itemID string, chunks []Chunk) error {
	// Call RAG service /embed-batch for all chunks
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.Text
	}

	embeddings, err := p.callRAGEmbedBatch(ctx, texts)
	if err != nil {
		log.Printf("embed-batch failed, falling back to individual embed calls: %v", err)
		// Fallback: embed each chunk individually
		embeddings = make([][]float32, len(chunks))
		for i, c := range chunks {
			emb, err := p.callRAGEmbed(ctx, c.Text)
			if err != nil {
				return fmt.Errorf("failed to embed chunk %d: %w", i, err)
			}
			embeddings[i] = emb
		}
	}

	// Store embeddings in pgvector
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for i, chunk := range chunks {
		if i >= len(embeddings) {
			break
		}
		vectorStr := p.formatVector(embeddings[i])
		_, err := tx.Exec(ctx,
			`INSERT INTO vector_embeddings (item_id, chunk_index, chunk_text, embedding)
			 VALUES ($1, $2, $3, $4::vector)
			 ON CONFLICT (item_id, chunk_index) DO UPDATE SET
			   chunk_text = EXCLUDED.chunk_text,
			   embedding = EXCLUDED.embedding`,
			itemID, chunk.Index, chunk.Text, vectorStr,
		)
		if err != nil {
			return fmt.Errorf("failed to insert embedding for chunk %d: %w", i, err)
		}
	}

	return tx.Commit(ctx)
}

func (p *Processor) callRAGEmbed(ctx context.Context, text string) ([]float32, error) {
	reqBody, _ := json.Marshal(EmbedRequest{Text: text})
	req, err := http.NewRequestWithContext(ctx, "POST", p.ragURL+"/embed", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("RAG embed request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("RAG embed returned %d: %s", resp.StatusCode, string(body))
	}

	var result EmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode RAG embed response: %w", err)
	}

	return result.Embedding, nil
}

func (p *Processor) callRAGEmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	type BatchReq struct {
		Texts []string `json:"texts"`
	}
	type BatchResp struct {
		Embeddings [][]float32 `json:"embeddings"`
	}

	reqBody, _ := json.Marshal(BatchReq{Texts: texts})
	req, err := http.NewRequestWithContext(ctx, "POST", p.ragURL+"/embed-batch", bytes.NewReader(reqBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("RAG embed-batch request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("RAG embed-batch returned %d: %s", resp.StatusCode, string(body))
	}

	var result BatchResp
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode RAG embed-batch response: %w", err)
	}

	return result.Embeddings, nil
}

func (p *Processor) formatVector(embedding []float32) string {
	strs := make([]string, len(embedding))
	for i, v := range embedding {
		strs[i] = fmt.Sprintf("%.6f", v)
	}
	return "[" + strings.Join(strs, ",") + "]"
}

func (p *Processor) updateIngestionStatus(ctx context.Context, itemID, status string) error {
	log.Printf("Item %s ingestion status: %s", itemID, status)
	key := fmt.Sprintf("ingestion_status:%s", itemID)
	return p.redis.Set(ctx, key, status, 24*time.Hour).Err()
}
