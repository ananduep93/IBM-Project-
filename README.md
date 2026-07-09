# AURA Document Analyzer 📄✨

A full-stack, AI-powered document intelligence dashboard that analyzes text-based and scanned PDFs or TXT files. Users can upload documents, view summaries, extract structured data (names, dates, financials, tasks), rewrite sections in various tones, and chat interactively with files in real-time.

Built using **FastAPI (Python)**, **React (Vite) with Vanilla CSS**, and the **Google Gemini API** (using the new `google-genai` SDK).

---

## Features

1.  **Multimodal Upload & Parsing:** Seamlessly accepts text PDFs, plain TXT files, and **scanned image-only PDFs**. Scanned files are parsed multimodally via Gemini's Files API.
2.  **Executive Summarization:** Generates structured overviews, key takeaways, and metric lists.
3.  **Structured Entity Extraction:** Scans and outputs names of people/organizations, critical dates, action items, and financial values into readable tables.
4.  **Tone Translation (Rewriter):** Modifies document content to match selected styles: *Professional*, *Casual*, *Simplified (ELI5)*, or *Persuasive*.
5.  **Interactive Q&A (RAG-Lite):** Allows continuous conversational inquiries on the document with live **Server-Sent Events (SSE) token-by-token text streaming**.

---

## Technical Stack

*   **Frontend:** React (Vite), Vanilla CSS (Custom Glassmorphism Design System)
*   **Backend:** Python 3.12+, FastAPI, Uvicorn, Python-Multipart, PyPDF
*   **AI Engine:** Google Gemini API (`gemini-2.5-flash` model, Gemini Files API)
*   **Containerization:** Multi-stage Docker, Docker Compose

---

## Getting Started

### Prerequisites

1.  **Node.js & npm** (Node v20+)
2.  **Python** (Python 3.12+ with `py` launcher)
3.  **Gemini API Key:** Obtain a key from the [Google AI Studio](https://aistudio.google.com/).

### Local Run (Without Docker)

#### 1. Setup Backend
1. Navigate to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   py -m venv venv
   .\venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Copy `.env.template` to `.env` and enter your API key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```
5. Start the backend developer server:
   ```bash
   python -m uvicorn app.main:app --reload --port 8000
   ```

#### 2. Setup Frontend
1. In a separate terminal, navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and go to: `http://localhost:5173`.

---

### Local Run (With Docker)

To build and run the unified production-ready Docker container locally:

1.  Add your API key inside `backend/.env`.
2.  From the project root directory, run:
    ```bash
    docker compose up --build
    ```
3.  Access the live web app at: `http://localhost:8000`.

---

## AWS Deployment Guide (AWS App Runner)

AWS App Runner is the recommended, fully-managed service to deploy this containerized application. It automatically configures secure `HTTPS` URLs, SSL certificates, load balancers, and autoscaling.

### Step 1: Build & Push Container to AWS ECR

1.  **Install AWS CLI** and configure your credentials:
    ```bash
    aws configure
    ```
2.  **Create an ECR Repository** in the AWS console or via CLI:
    ```bash
    aws ecr create-repository --repository-name document-analyzer --region us-east-1
    ```
3.  **Authenticate Docker** with ECR:
    ```bash
    aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
    ```
4.  **Build, Tag, and Push** the image:
    ```bash
    docker build -t document-analyzer .
    docker tag document-analyzer:latest <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/document-analyzer:latest
    docker push <YOUR_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/document-analyzer:latest
    ```

### Step 2: Deploy on AWS App Runner

1.  Open the **AWS App Runner** Console.
2.  Click **Create Service**.
3.  Choose **Container registry** -> **Amazon ECR** -> Select your `document-analyzer` repository and `latest` tag.
4.  Under **Deployment settings**, choose **Manual** or **Automatic** (triggers deployment on push).
5.  Under **Configure service**:
    *   **Port:** Set port to `80` (FastAPI listens on port 80 in Docker).
    *   **Environment Variables:** Add `GEMINI_API_KEY` under variables.
6.  Click **Create & deploy**.
7.  Once the status becomes `Running`, copy the public **Default domain** URL (e.g., `https://xxxxxx.us-east-1.awsapprunner.com`) to submit as your live application link!

---

## Submission Checklist

Your deliverable requires pasting the live AWS URL into:
1.  **Project Concept Note (PDF)**
2.  **Project Report**

Make sure your `backend/.env` is ignored by git and not pushed to GitHub!
