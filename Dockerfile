FROM python:3.12-slim AS backend-runner
WORKDIR /app/backend

# Install system dependencies (curl for healthchecks, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend files
COPY backend/ ./

# Copy compiled frontend directly from the source bundle (pre-built locally)
COPY frontend/dist /app/frontend/dist

# Expose port 80 for Elastic Beanstalk
EXPOSE 80

# Environment variables
ENV PORT=80
ENV HOST=0.0.0.0

# Start FastAPI server via Uvicorn
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
