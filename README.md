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

