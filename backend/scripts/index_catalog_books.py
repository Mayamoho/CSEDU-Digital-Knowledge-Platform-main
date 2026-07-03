#!/usr/bin/env python3
"""
Index library catalog books into vector store
Creates synthetic documents from book metadata for RAG retrieval
"""

import os
import sys
import psycopg
from psycopg.rows import dict_row
import requests
from typing import List, Dict

# Database connection (use Docker service names when running inside container)
DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "csedu_platform")
DB_USER = os.getenv("DB_USER", "csedu_user")
DB_PASS = os.getenv("DB_PASSWORD", "csedu_secure_password")

# RAG service (localhost since running inside the RAG container)
RAG_URL = os.getenv("RAG_URL", "http://localhost:8001")


def get_catalog_books() -> List[Dict]:
    """Fetch all books from library catalog"""
    conn_string = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"
    conn = psycopg.connect(conn_string, row_factory=dict_row)
    
    cursor = conn.cursor()
    cursor.execute("""
        SELECT catalog_id, title, author, isbn, format, 
               location, year, total_copies, available_copies
        FROM library_catalog
        ORDER BY title
    """)
    
    books = []
    for row in cursor.fetchall():
        books.append({
            "catalog_id": str(row["catalog_id"]),
            "title": row["title"],
            "author": row["author"],
            "isbn": row["isbn"] or "",
            "format": row["format"],
            "location": row["location"] or "Main Library",
            "year": row["year"],
            "total_copies": row["total_copies"],
            "available_copies": row["available_copies"]
        })
    
    cursor.close()
    conn.close()
    
    return books


def create_book_document(book: Dict) -> str:
    """Create a text document from book metadata"""
    doc = f"""Title: {book['title']}

Author: {book['author']}

ISBN: {book['isbn']}

Format: {book['format']}

Year: {book['year'] or 'N/A'}

Location: {book['location']}

Availability: {book['available_copies']} of {book['total_copies']} copies available

This is a library book available for borrowing. You can check out this book from the library catalog.
"""
    return doc


def get_embedding(text: str) -> List[float]:
    """Get embedding from RAG service"""
    try:
        response = requests.post(
            f"{RAG_URL}/embed",
            json={"text": text},
            timeout=30
        )
        response.raise_for_status()
        return response.json()["embedding"]
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return None


def create_catalog_embedding_table():
    """Create table for catalog book embeddings if it doesn't exist"""
    conn_string = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"
    conn = psycopg.connect(conn_string)
    
    cursor = conn.cursor()
    
    # Create table for catalog embeddings
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS catalog_embeddings (
            embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            catalog_id UUID NOT NULL REFERENCES library_catalog(catalog_id) ON DELETE CASCADE,
            chunk_text TEXT NOT NULL,
            embedding vector(768),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(catalog_id)
        )
    """)
    
    # Create index
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_catalog_embeddings_hnsw
        ON catalog_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)
    
    conn.commit()
    cursor.close()
    conn.close()
    
    print("✓ Created catalog_embeddings table")


def index_books():
    """Index all catalog books"""
    print("=" * 60)
    print("Indexing Library Catalog Books for RAG")
    print("=" * 60)
    
    # Create table if needed
    create_catalog_embedding_table()
    
    # Fetch books
    print("\nFetching catalog books...")
    books = get_catalog_books()
    print(f"Found {len(books)} books")
    
    if not books:
        print("No books to index")
        return
    
    # Index each book
    conn_string = f"host={DB_HOST} port={DB_PORT} dbname={DB_NAME} user={DB_USER} password={DB_PASS}"
    conn = psycopg.connect(conn_string)
    cursor = conn.cursor()
    
    indexed = 0
    failed = 0
    
    for i, book in enumerate(books, 1):
        print(f"\n[{i}/{len(books)}] Indexing: {book['title']}")
        
        # Create document
        doc_text = create_book_document(book)
        
        # Get embedding
        embedding = get_embedding(doc_text)
        
        if embedding is None:
            print(f"  ✗ Failed to get embedding")
            failed += 1
            continue
        
        try:
            # Upsert embedding
            cursor.execute("""
                INSERT INTO catalog_embeddings (catalog_id, chunk_text, embedding, updated_at)
                VALUES (%s, %s, %s, NOW())
                ON CONFLICT (catalog_id) 
                DO UPDATE SET 
                    chunk_text = EXCLUDED.chunk_text,
                    embedding = EXCLUDED.embedding,
                    updated_at = NOW()
            """, (book['catalog_id'], doc_text, embedding))
            
            conn.commit()
            print(f"  ✓ Indexed successfully")
            indexed += 1
            
        except Exception as e:
            print(f"  ✗ Database error: {e}")
            conn.rollback()
            failed += 1
    
    cursor.close()
    conn.close()
    
    print("\n" + "=" * 60)
    print(f"Indexing Complete!")
    print(f"  Indexed: {indexed}")
    print(f"  Failed:  {failed}")
    print("=" * 60)


if __name__ == "__main__":
    index_books()
