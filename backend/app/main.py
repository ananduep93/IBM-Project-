import os
import shutil
import uuid
import logging
from typing import List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Import services
from app.services.pdf_parser import extract_text_from_pdf
from app.services.llm_service import (
    upload_file_to_gemini,
    delete_file_from_gemini,
    generate_summary,
    extract_entities,
    rewrite_text,
    stream_chat
)

app = FastAPI(title="Document Analyzer API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, restrict to correct origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent upload folder
UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../uploads"))
os.makedirs(UPLOADS_DIR, exist_ok=True)

# In-memory document storage (acts as database)
document_db: Dict[str, Dict[str, Any]] = {}

class ChatHistoryItem(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    chat_history: List[ChatHistoryItem]
    user_message: str

class RewritePayload(BaseModel):
    tone: str

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Endpoint to upload a PDF or TXT document.
    Saves it locally in a persistent uploads/ directory, extracts digital text if available,
    and uploads it to the Gemini Files API.
    """
    logger.info(f"Received file upload request: {file.filename}")
    
    # Check extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".txt"]:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported.")
    
    # Generate unique ID
    doc_id = str(uuid.uuid4())
    persistent_file_path = os.path.join(UPLOADS_DIR, f"{doc_id}{ext}")
    
    # Save file locally
    try:
        with open(persistent_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error(f"Failed to save file locally: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Determine MIME type
    mime_type = "application/pdf" if ext == ".pdf" else "text/plain"
    
    # Local text extraction (preview/fallback)
    local_text = ""
    is_scanned = False
    if ext == ".pdf":
        try:
            local_text = extract_text_from_pdf(persistent_file_path)
            # If no text could be extracted from PDF, it's likely scanned
            if not local_text.strip():
                is_scanned = True
                logger.info(f"No text extracted. Document {file.filename} is likely scanned.")
        except Exception as e:
            logger.warning(f"Local PDF text extraction failed: {str(e)}")
            is_scanned = True
    else: # TXT
        try:
            with open(persistent_file_path, "r", encoding="utf-8", errors="ignore") as f:
                local_text = f.read()
        except Exception as e:
            logger.warning(f"Local TXT reading failed: {str(e)}")
            
    # Upload to Gemini Files API (multimodal analysis)
    try:
        gemini_ref = upload_file_to_gemini(persistent_file_path, mime_type)
        gemini_name = gemini_ref.name
    except Exception as e:
        logger.error(f"Gemini API upload failed: {str(e)}")
        # Cleanup local file on failure
        if os.path.exists(persistent_file_path):
            os.remove(persistent_file_path)
        raise HTTPException(status_code=500, detail=f"Gemini integration failed: {str(e)}")
        
    # Store metadata in DB
    doc_metadata = {
        "id": doc_id,
        "filename": file.filename,
        "mime_type": mime_type,
        "gemini_name": gemini_name,
        "local_text": local_text,
        "is_scanned": is_scanned,
        "file_path": persistent_file_path,
        "size": file.size or os.path.getsize(persistent_file_path) if os.path.exists(persistent_file_path) else 0,
        "uploaded_at": 0.0
    }
    # Fix uploaded_at timestamp
    import time as pytime
    doc_metadata["uploaded_at"] = pytime.time()
    
    document_db[doc_id] = doc_metadata
    logger.info(f"Document registered successfully: {doc_id}")
    
    return {
        "id": doc_id,
        "filename": doc_metadata["filename"],
        "mime_type": doc_metadata["mime_type"],
        "is_scanned": doc_metadata["is_scanned"],
        "size": doc_metadata["size"],
        "text_preview": doc_metadata["local_text"][:2000] # Provide snippet
    }

@app.get("/api/documents")
def list_documents():
    """
    List all uploaded documents (metadata only).
    """
    return [
        {
            "id": doc["id"],
            "filename": doc["filename"],
            "mime_type": doc["mime_type"],
            "is_scanned": doc["is_scanned"],
            "size": doc["size"],
            "uploaded_at": doc["uploaded_at"]
        }
        for doc in document_db.values()
    ]

@app.get("/api/documents/{doc_id}")
def get_document(doc_id: str):
    """
    Get detailed document preview content.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "mime_type": doc["mime_type"],
        "is_scanned": doc["is_scanned"],
        "size": doc["size"],
        "text": doc["local_text"]
    }

@app.get("/api/documents/{doc_id}/file")
def get_document_file(doc_id: str):
    """
    Get the original uploaded PDF or TXT file.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = doc.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Original file not found on server")
    return FileResponse(file_path, media_type=doc["mime_type"], filename=doc["filename"])

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str, background_tasks: BackgroundTasks):
    """
    Delete a document from the local store and Gemini Files API.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Add deletion to background tasks to keep API response quick
    background_tasks.add_task(delete_file_from_gemini, doc["gemini_name"])
    
    # Delete local file
    file_path = doc.get("file_path")
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
            logger.info(f"Local file {file_path} deleted.")
        except Exception as e:
            logger.warning(f"Failed to delete local file {file_path}: {str(e)}")
            
    # Remove from memory
    del document_db[doc_id]
    logger.info(f"Document {doc_id} deleted.")
    return {"message": "Document deleted successfully."}

@app.post("/api/documents/{doc_id}/summary")
def get_summary(doc_id: str):
    """
    Get the AI-generated structured summary.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        summary = generate_summary(doc["gemini_name"])
        return {"summary": summary}
    except Exception as e:
        logger.error(f"Failed to generate summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{doc_id}/extract")
def get_extracted_entities(doc_id: str):
    """
    Get the AI-extracted entities.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        entities = extract_entities(doc["gemini_name"])
        return {"entities": entities}
    except Exception as e:
        logger.error(f"Failed to extract entities: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{doc_id}/rewrite")
def get_rewritten_text(doc_id: str, payload: RewritePayload):
    """
    Get the AI-rewritten text in a specified tone.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        rewritten = rewrite_text(doc["gemini_name"], payload.tone)
        return {"rewritten": rewritten}
    except Exception as e:
        logger.error(f"Failed to rewrite text: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/documents/{doc_id}/chat")
async def chat_with_document(doc_id: str, payload: ChatPayload):
    """
    SSE stream endpoint for chat dialogue about the document.
    """
    doc = document_db.get(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    def event_generator():
        try:
            import json
            # Stream tokens
            for token in stream_chat(
                file_name=doc["gemini_name"],
                chat_history=[{"role": item.role, "content": item.content} for item in payload.chat_history],
                user_message=payload.user_message
            ):
                yield f"data: {json.dumps({'text': token})}\n\n"
        except Exception as e:
            logger.error(f"SSE error: {str(e)}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

# Mount production frontend static files if they exist
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../frontend/dist"))
if os.path.exists(frontend_dist):
    logger.info(f"Serving production frontend from: {frontend_dist}")
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="static")

    # Catch-all for React Router SPA URLs (must be defined after mount)
    @app.get("/{catchall:path}")
    def read_index(catchall: str):
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "API is running. Frontend static files not found."}
else:
    logger.warning("Production frontend build folder not found. Serving API endpoints only.")
    @app.get("/")
    def index():
        return {"message": "Document Analyzer API is running. Running in Dev Mode without frontend static files."}
