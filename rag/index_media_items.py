#!/usr/bin/env python3
"""
Index all unindexed media items (research/projects/archives)
Processes PDFs and creates embeddings for RAG retrieval
"""

import os
import psycopg
from psycopg.rows import dict_row
from typing import List, Dict
import PyMuPDF  # fitz
from embedder import embedder

# Database connection
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "csedu_platform")
DB_USER = os.getenv("DB_USER", "csedu_user")
DB_PASS = os.getenv("DB_PASSWORD", "csedu_secure_password")

# MinIO connection
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_BUCKET = os.getenv("MINIO_BUCKET_NAME", "csedu-media")


def get_unindexed_items() -> List[Dict]:
    """Get media items that don't have embeddings yet"""
    conn_string = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"
    conn = psycopg.connect(conn_string, row_factory=dict_row)
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT mi.item_id, mi.title, mi.item_type, mi.format, mi.file_path
        FROM media_items mi
        LEFT JOIN vector_embeddings ve ON mi.item_id = ve.item_id
        WHERE ve.item_id IS NULL 
          AND mi.status = 'published'
        ORDER BY mi.item_type, mi.title
    """)
    
    items = list(cursor.fetchall())
    cursor.close()
    conn.close()
    
    return items


def chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks"""
    chunks = []
    start = 0
    text_len = len(text)
    
    while start < text_len:
        end = start + chunk_size
        chunk = text[start:end]
        
        if chunk.strip():
            chunks.append(chunk.strip())
        
        start += (chunk_size - overlap)
    
    return chunks


def extract_text_from_file(file_path: str, item_type: str, title: str) -> str:
    """Extract text from file - for now, use title and type as fallback"""
    # In a real scenario, you'd download from MinIO and extract text
    # For now, create a synthetic document from metadata
    return f"""Title: {title}
Type: {item_type.capitalize()}

This is a {item_type} document available in the CSEDU Digital Knowledge Platform.
Document ID: {file_path if file_path else 'N/A'}

[Note: Full text extraction from MinIO storage would be implemented here]
"""


def index_item(item: Dict, conn) -> int:
    """Index a single media item"""
    cursor = conn.cursor()
    
    # Extract text
    text = extract_text_from_file(item['file_path'], item['item_type'], item['title'])
    
    # Chunk text
    chunks = chunk_text(text)
    
    if not chunks:
        print(f"    ⚠️  No text extracted")
        return 0
    
    print(f"    Extracted {len(chunks)} chunks")
    
    # Generate embeddings and insert
    indexed = 0
    for idx, chunk in enumerate(chunks):
        try:
            embedding = embedder.embed_text(chunk)
            
            cursor.execute("""
                INSERT INTO vector_embeddings (item_id, chunk_index, chunk_text, embedding)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (item_id, chunk_index) DO UPDATE
                SET chunk_text = EXCLUDED.chunk_text,
                    embedding = EXCLUDED.embedding
            """, (str(item['item_id']), idx, chunk, embedding))
            
            indexed += 1
        except Exception as e:
            print(f"    ✗ Failed chunk {idx}: {e}")
    
    conn.commit()
    cursor.close()
    
    return indexed


def main():
    print("=" * 60)
    print("Indexing Unindexed Media Items")
    print("=" * 60)
    
    # Get unindexed items
    print("\nFetching unindexed items...")
    items = get_unindexed_items()
    
    if not items:
        print("✓ All media items are already indexed!")
        return
    
    print(f"Found {len(items)} items to index:")
    for item in items:
        print(f"  - {item['title']} ({item['item_type']})")
    
    # Index each item
    conn_string = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"
    conn = psycopg.connect(conn_string)
    
    total_chunks = 0
    successful = 0
    failed = 0
    
    for i, item in enumerate(items, 1):
        print(f"\n[{i}/{len(items)}] Indexing: {item['title']}")
        print(f"  Type: {item['item_type']}")
        
        try:
            chunks = index_item(item, conn)
            if chunks > 0:
                print(f"  ✓ Indexed {chunks} chunks")
                total_chunks += chunks
                successful += 1
            else:
                print(f"  ✗ No chunks indexed")
                failed += 1
        except Exception as e:
            print(f"  ✗ Error: {e}")
            failed += 1
    
    conn.close()
    
    print("\n" + "=" * 60)
    print("Indexing Complete!")
    print(f"  Items indexed: {successful}")
    print(f"  Items failed:  {failed}")
    print(f"  Total chunks:  {total_chunks}")
    print("=" * 60)


if __name__ == "__main__":
    main()
