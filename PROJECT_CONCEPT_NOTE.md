# PROJECT CONCEPT NOTE
**Course Work:** Vibe Coding Masterclass Series (IBM SkillsBuild Internship)  
**Project Title:** AURA Document Analyzer  
**Application Name:** AURA (AI Unified Reading Assistant)  
**Live AWS URL:** http://aura-doc-analyzer-env.eba-mdmg2bkc.ap-south-1.elasticbeanstalk.com  

---

## 1. Problem Statement / Objective
In corporate, research, and academic environments, users are constantly inundated with long, text-heavy documents, including contracts, research papers, scanned invoices, and reports. 

Traditional PDF readers only allow basic keyword searching, and standard Optical Character Recognition (OCR) tools simply dump raw text without contextual layout understanding. 

**AURA** is designed to solve this by providing a unified, intelligent document analysis dashboard that parses, summarizes, structures, rewrites, and allows conversational Q&A with any uploaded document (including scanned image-only PDFs) in real-time.

---

## 2. Target User & Use Cases
*   **Students & Researchers:** Quickly summarize long academic papers, extract citations, and chat with textbooks to clarify concepts.
*   **Legal & Finance Professionals:** Upload contracts or financial reports to extract specific names, critical dates, financial figures, and action items in structured tables.
*   **Content Creators & Writers:** Extract paragraphs from documents and rewrite them in different tones (e.g., simplifying complex terms to "Explain Like I'm 5").

---

## 3. LLM Model, API & Backend Tech
*   **LLM Model:** `gemini-2.5-flash` with automatic model fallback to `gemini-2.0-flash`, `gemini-2.0-flash-lite`, and `gemini-1.5-flash` for high reliability.
*   **AI SDK:** `google-genai` (Python SDK).
*   **Gemini Files API:** Utilized to upload and store document objects securely on Google's infrastructure, allowing rapid inference and multimodal processing of images/scanned PDFs without losing document layout context.
*   **Backend gateway:** FastAPI serving React build static files and routing requests.

---

## 4. Key Features of the Application
1.  **Multimodal Upload & Parsing:** Handles raw text files, standard digital PDFs, and scanned image-only documents.
2.  **Executive Summarization:** Generates structural summaries, key takeaways, and key metrics.
3.  **Structured Entity Extraction:** Automatically parses and lists names, critical dates, financial metrics, and action items in clean, interactive tables.
4.  **Tone Rewriter:** Modifies document sections into *Professional*, *Casual*, *Academic*, *Simplified (Simple)*, *Creative*, or *Persuasive* tones.
5.  **Interactive Q&A Chat:** A conversational panel with Server-Sent Events (SSE) token-by-token streaming to ask questions and get instant answers about the document.
6.  **SaaS Multi-page Architecture:** Real multi-page routing featuring a public Landing Page, About, FAQ, Contact Form, Privacy Policy, and Terms of Service pages.
7.  **Firebase Authentication:** Secured user accounts supporting both traditional Email/Password login and Google Sign-in.
8.  **Firebase Firestore Real-time Sync:** Synchronizes all uploaded document metadata, AI summaries, tone rewrites, and chat history in real-time across multiple devices.
9.  **Self-Healing Multi-Device Gateway:** Automatically restores missing local SQLite entries on the backend container when loading documents on a new device by fetching metadata references (`X-Gemini-Name`, `X-File-Name`) directly from Firestore.
10. **Document Workspace Deletion:** Users can delete documents, wiping them from the backend container, the Gemini Files API, and Firebase Firestore simultaneously.

---

## 5. Expected User Experience & Outcomes
*   **Premium Ruled Sketchbook UI:** A light-themed, modern hand-drawn ruled notebook aesthetic that is highly responsive on mobile and desktop viewports, featuring a responsive mobile hamburger menu.
*   **Zero-Latency Conversational Chat:** Real-time text streaming mimics human speech and eliminates long loading wait times.
*   **Privacy-First Cloud Workspace:** Dynamic token tracking and credentials modals that allow users to override rate-limits with their own Google Gemini API keys.
*   **Persistent User Data:** User-analyzed data is preserved in Firestore, guaranteeing data safety even if AWS container instances scale, restart, or clear local databases.
