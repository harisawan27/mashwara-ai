# Mashwara AI — Google Cloud Run Production Dockerfile (Pure FastAPI Backend)
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ /app/backend/

# Set Python path for module resolution
ENV PYTHONPATH=/app/backend
ENV PYTHONUNBUFFERED=1

# Expose default Cloud Run port
EXPOSE 8080

# Run FastAPI backend via Uvicorn
CMD ["sh", "-c", "uvicorn main:app --app-dir /app/backend --host 0.0.0.0 --port ${PORT:-8080}"]
