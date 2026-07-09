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
*   **Database:** SQLite (Local persistent client metadata storage)
*   **AI Engine:** Google Gemini API (`gemini-2.5-flash` model, Gemini Files API)
*   **Containerization:** Multi-stage Docker, Docker Compose

---

## 🔒 Session Isolation & Security
To keep document uploads completely private between different users and devices without requiring complex third-party signups or accounts:
1.  **Local SQLite Database:** A local `app.db` stores file metadata securely on the server.
2.  **Client Session IDs:** The frontend generates a unique, anonymous UUID in `localStorage` upon first load.
3.  **Scoped Requests:** The client UUID is sent via the custom `X-Client-Id` header to scope all document operations (listing, chatting, and summaries) strictly to that browser instance.

---

## 🚀 Getting Started

### Local Development (Without Docker)

#### 1. Setup Backend
1.  Navigate to `backend/` and initialize virtual environment:
    ```bash
    cd backend
    python -m venv venv
    .\venv\Scripts\activate
    ```
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Configure `.env` with your `GEMINI_API_KEY`.
4.  Run FastAPI:
    ```bash
    python -m uvicorn app.main:app --reload --port 8000
    ```

#### 2. Setup Frontend
1.  Navigate to `frontend/`:
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
2.  Access the site at `http://localhost:5173`.

