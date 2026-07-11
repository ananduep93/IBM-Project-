# PROJECT CONCEPT NOTE
**Course Work:** Vibe Coding Masterclass Series  
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
*   **Students & Researchers:** Quickly summarize long academic papers, extract citations, and chat with complex textbooks to clarify concepts.
*   **Legal & Finance Professionals:** Upload contracts or financial reports to extract specific names, critical dates, financial figures, and action items in structured tables.
*   **Content Creators & Writers:** Extract paragraphs from documents and rewrite them in different tones (e.g., simplifying complex terms to "Explain Like I'm 5").

---

## 3. LLM Model and API Used
*   **LLM Model:** `gemini-2.5-flash` (provided by Google AI Studio).
*   **AI SDK:** `google-genai` (Python SDK).
*   **Gemini Files API:** Utilized to upload and store document objects securely on Google's infrastructure, allowing rapid inference and multimodal processing of images/scanned PDFs without losing document layout context.

---

## 4. Key Features of the Application
1.  **Multimodal Upload & Parsing:** Handles raw text files, standard digital PDFs, and scanned image-only documents.
2.  **Executive Summarization:** Generates structural summaries, key takeaways, and key metrics.
3.  **Structured Entity Extraction:** Automatically parses and lists names, critical dates, financial metrics, and action items in clean, interactive tables.
4.  **Tone Rewriter:** Modifies document sections into *Professional*, *Casual*, *Simplified (ELI5)*, or *Persuasive* tones.
5.  **Interactive Q&A Chat:** A conversational panel with Server-Sent Events (SSE) token-by-token streaming to ask questions and get instant answers about the document.
6.  **Local SQLite Session Isolation:** Uses an anonymous `X-Client-Id` UUID header generated in browser `localStorage` to isolate documents on a local server SQLite database, ensuring privacy between users without requiring complex authentication.

---

## 5. Expected User Experience & Outcomes
*   **Premium Glassmorphic UI:** A light-themed, modern SaaS dashboard with a curated palette (Deep Indigo and Icy Lavender) that is fully responsive on mobile and desktop.
*   **Zero-Latency Conversational Chat:** Real-time text streaming mimics human speech and eliminates long loading wait times.
*   **Privacy-First Workspace:** Users can share the website URL with friends or colleagues, and each person will only see their own uploaded documents.
