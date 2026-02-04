# ===========================================================
#  GisulMatch Backend Dockerfile (with FAISS + OCR + DOCX)
# ===========================================================
FROM python:3.12-slim

# Install system-level dependencies required for resume processing
# Combined in single layer and cleaned up immediately to reduce image size
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    antiword \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/*

# Set workdir
WORKDIR /app

# Upgrade pip first (cached separately)
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# Copy only requirements first for better layer caching
# Use docker-optimized requirements (excludes torch/sentence-transformers)
COPY ./backend/requirements-docker.txt /app/requirements.txt

# Install Python dependencies
# torch and sentence-transformers are excluded (not needed for OpenAI embeddings)
# This reduces image size from ~13GB to ~1.5GB
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code after dependencies
COPY ./backend /app

# Environment
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Expose backend port
EXPOSE 8000

# Command to start FastAPI app
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
