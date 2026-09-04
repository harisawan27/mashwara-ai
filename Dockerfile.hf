# Dockerfile for Hugging Face Spaces (Compatible with Docker & Gradio)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and Gradio entrypoint
COPY backend/ /app/backend/
COPY app.py /app/

# Hugging Face Spaces expose port 7860 by default
EXPOSE 7860

# Command to run the unified Gradio + FastAPI app
CMD ["python", "app.py"]
