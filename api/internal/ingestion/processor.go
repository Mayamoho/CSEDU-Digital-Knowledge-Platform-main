package ingestion

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Processor struct {
	db    *pgxpool.Pool
	redis *redis.Client
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

func NewProcessor(db *pgxpool.Pool, redis *redis.Client) *Processor {
	return &Processor{db: db, redis: redis}
}

func (p *Processor) ProcessJob(ctx context.Context, jobData string) error {
	var job IngestionJob
	if err := json.Unmarshal([]byte(jobData), &job); err != nil {
		return fmt.Errorf("failed to parse job: %w", err)
	}

	log.Printf("Processing ingestion job for item %s", job.ItemID)

	// 1. Extract text from file
	text, err := p.extractText(ctx, job.FilePath, job.Format)
	if err != nil {
		return fmt.Errorf("text extraction failed: %w", err)
	}

	// 2. Chunk the text
	chunks := p.chunkText(text, 512, 50) // 512 tokens, 50 token overlap

	// 3. Generate embeddings and store in pgvector
	if err := p.storeEmbeddings(ctx, job.ItemID, chunks); err != nil {
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
	// For MVP, we'll implement basic PDF text extraction
	// In production, use PyMuPDF or similar
	switch format {
	case "pdf":
		return p.extractPDFText(ctx, filePath)
	case "txt":
		return p.extractPlainText(ctx, filePath)
	case "docx", "doc":
		return p.extractDocxText(ctx, filePath)
	default:
		return "", fmt.Errorf("unsupported format: %s", format)
	}
}

func (p *Processor) extractPDFText(ctx context.Context, filePath string) (string, error) {
	// For MVP, return placeholder text
	// In production, integrate with PyMuPDF via Python service or Go PDF library
	return fmt.Sprintf("PDF content from %s (placeholder - implement PyMuPDF integration)", filePath), nil
}

func (p *Processor) extractPlainText(ctx context.Context, filePath string) (string, error) {
	// For MVP, return placeholder
	return fmt.Sprintf("Plain text content from %s", filePath), nil
}

func (p *Processor) extractDocxText(ctx context.Context, filePath string) (string, error) {
	// For MVP, return placeholder
	return fmt.Sprintf("DOCX content from %s (placeholder - implement docx parsing)", filePath), nil
}

func (p *Processor) chunkText(text string, chunkSize, overlap int) []Chunk {
	// Simple token-based chunking
	// In production, use proper tokenizers
	words := strings.Fields(text)
	var chunks []Chunk

	for i := 0; i < len(words); i += chunkSize - overlap {
		end := i + chunkSize
		if end > len(words) {
			end = len(words)
		}

		chunk := strings.Join(words[i:end], " ")
		chunks = append(chunks, Chunk{
			Index: len(chunks),
			Text:  chunk,
		})

		if end >= len(words) {
			break
		}
	}

	return chunks
}

func (p *Processor) storeEmbeddings(ctx context.Context, itemID string, chunks []Chunk) error {
	// For MVP, always use mock embeddings
	return p.storeMockEmbeddings(ctx, itemID, chunks)
}

func (p *Processor) storeMockEmbeddings(ctx context.Context, itemID string, chunks []Chunk) error {
	// Generate mock 768-dimensional vectors for MVP
	tx, err := p.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, chunk := range chunks {
		// Generate mock vector (all 0.1 values for simplicity)
		vector := make([]string, 768)
		for i := range vector {
			vector[i] = "0.1"
		}
		vectorStr := "[" + strings.Join(vector, ",") + "]"

		_, err := tx.Exec(ctx,
			`INSERT INTO vector_embeddings (item_id, chunk_index, chunk_text, embedding)
			 VALUES ($1, $2, $3, $4)`,
			itemID, chunk.Index, chunk.Text, vectorStr,
		)
		if err != nil {
			return fmt.Errorf("failed to insert mock embedding: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (p *Processor) formatVector(embedding []float32) string {
	// Convert float32 slice to PostgreSQL vector format
	strs := make([]string, len(embedding))
	for i, v := range embedding {
		strs[i] = fmt.Sprintf("%.6f", v)
	}
	return "[" + strings.Join(strs, ",") + "]"
}

func (p *Processor) updateIngestionStatus(ctx context.Context, itemID, status string) error {
	// For MVP, we'll just log the status
	// In production, add ingestion_status column to media_items table
	log.Printf("Item %s ingestion status: %s", itemID, status)

	// Store status in Redis for tracking
	key := fmt.Sprintf("ingestion_status:%s", itemID)
	return p.redis.Set(ctx, key, status, 24*time.Hour).Err()
}
