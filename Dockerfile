# ==========================================
# Stage 1: Build the React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

# Copy frontend package list and lockfile
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source files
COPY frontend/ ./

# Build frontend static files (generates /frontend/dist)
RUN npm run build

# ==========================================
# Stage 2: Build the FastAPI Backend & Serve
# ==========================================
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

# Copy compiled frontend from Stage 1 to match the relative paths
COPY --from=frontend-builder /frontend/dist /app/frontend/dist

# Expose port 80 for App Runner / Elastic Beanstalk
EXPOSE 80

# Environment variables
ENV PORT=80
ENV HOST=0.0.0.0

# Start FastAPI server via Uvicorn
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
