FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download and cache the embedding model at build time
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2')"

# Copy application code
COPY . .

# Expose port (Render will set PORT env variable)
EXPOSE 8001

# Run the application (use $PORT for Render compatibility)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001} --workers 2
