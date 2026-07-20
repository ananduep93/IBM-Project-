import os
import shutil
import uuid
import logging
from typing import List, Dict, Any, Generator
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Header, Query
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
    generate_full_analysis,
    generate_summary,
    extract_entities,
    rewrite_text,
    stream_chat
)
from app.db import init_db, add_document, get_documents, get_document, delete_document_record, update_document_field

app = FastAPI(title="Document Analyzer API", version="1.0.0")

@app.on_event("startup")
def on_startup():
    init_db()

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

class ChatHistoryItem(BaseModel):
    role: str
    content: str

class ChatPayload(BaseModel):
    chat_history: List[ChatHistoryItem]
    user_message: str

class RewritePayload(BaseModel):
    tone: str

@app.post("/api/upload")
async def upload_document(
    file: UploadFile = File(...),
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key")
):
    """
    Endpoint to upload a PDF or TXT document.
    Saves it locally in a persistent uploads/ directory, extracts digital text if available,
    and uploads it to the Gemini Files API.
    """
    logger.info(f"Received file upload request from client {x_client_id}: {file.filename}")
    
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
        gemini_ref = upload_file_to_gemini(persistent_file_path, mime_type, custom_api_key=x_gemini_key)
        gemini_name = gemini_ref.name
    except Exception as e:
        logger.error(f"Gemini API upload failed: {str(e)}")
        # Cleanup local file on failure
        if os.path.exists(persistent_file_path):
            os.remove(persistent_file_path)
        raise HTTPException(status_code=500, detail=f"Gemini integration failed: {str(e)}")
        
    # Store metadata in DB (SQLite)
    size = file.size or os.path.getsize(persistent_file_path) if os.path.exists(persistent_file_path) else 0
    try:
        doc = add_document(
            doc_id=doc_id,
            client_id=x_client_id,
            filename=file.filename,
            mime_type=mime_type,
            gemini_name=gemini_name,
            size=size
        )
        logger.info(f"Document registered successfully in SQLite: {doc_id}")
    except Exception as e:
        logger.error(f"Failed to write metadata to SQLite: {str(e)}")
        # Cleanup local file on DB write failure
        if os.path.exists(persistent_file_path):
            os.remove(persistent_file_path)
        raise HTTPException(status_code=500, detail=f"Database registration failed: {str(e)}")
    
    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "mime_type": doc["mime_type"],
        "is_scanned": is_scanned,
        "size": doc["size"],
        "gemini_name": doc["gemini_name"],
        "text_preview": local_text[:2000] # Provide snippet
    }

@app.get("/api/documents")
def list_documents(x_client_id: str = Header(default="anonymous", alias="X-Client-Id")):
    """
    List all uploaded documents (metadata only) for the active client.
    """
    return get_documents(x_client_id)

def get_or_create_document(doc_id: str, client_id: str, gemini_name: str = None, filename: str = None) -> dict:
    doc = get_document(doc_id, client_id)
    if not doc and gemini_name:
        try:
            logger.info(f"Self-healing SQLite record for document {doc_id} with Gemini name {gemini_name}")
            doc = add_document(
                doc_id=doc_id,
                client_id=client_id,
                filename=filename or "Restored Document",
                mime_type="application/pdf" if (filename or "").endswith(".pdf") else "text/plain",
                gemini_name=gemini_name,
                size=0
            )
        except Exception as e:
            logger.error(f"Failed to self-heal document record: {str(e)}")
    return doc

@app.get("/api/documents/{doc_id}")
def get_document_endpoint(
    doc_id: str, 
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_name: str = Header(default=None, alias="X-Gemini-Name"),
    x_file_name: str = Header(default=None, alias="X-File-Name")
):
    """
    Get detailed document preview content.
    """
    doc = get_or_create_document(doc_id, x_client_id, x_gemini_name, x_file_name)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    import json
    rewrite_data = {}
    if doc.get("rewrite"):
        try:
            rewrite_data = json.loads(doc["rewrite"])
        except Exception:
            pass
            
    chat_data = []
    if doc.get("chat_history"):
        try:
            chat_data = json.loads(doc["chat_history"])
        except Exception:
            pass

    return {
        "id": doc["id"],
        "filename": doc["filename"],
        "mime_type": doc["mime_type"],
        "size": doc["size"],
        "gemini_name": doc.get("gemini_name"),
        "summary": doc.get("summary"),
        "entities": doc.get("entities"),
        "rewrite": rewrite_data,
        "chat_history": chat_data,
        "full_analysis": doc.get("full_analysis")
    }

@app.get("/api/documents/{doc_id}/file")
def get_document_file(
    doc_id: str,
    client_id: str = Query(None),
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id")
):
    """
    Get the original uploaded PDF or TXT file.
    """
    effective_client_id = client_id if (x_client_id == "anonymous" and client_id) else x_client_id
    doc = get_document(doc_id, effective_client_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    ext = ".pdf" if doc["mime_type"] == "application/pdf" else ".txt"
    file_path = os.path.join(UPLOADS_DIR, f"{doc_id}{ext}")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Original file not found on server")
    return FileResponse(file_path, media_type=doc["mime_type"], filename=doc["filename"])

@app.delete("/api/documents/{doc_id}")
def delete_document(
    doc_id: str,
    background_tasks: BackgroundTasks,
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key")
):
    """
    Delete a document from the SQLite database and Gemini Files API.
    """
    gemini_name = delete_document_record(doc_id, x_client_id)
    if not gemini_name:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Add deletion to background tasks to keep API response quick
    background_tasks.add_task(delete_file_from_gemini, gemini_name, x_gemini_key)
    
    # Delete local file if it exists
    for ext in [".pdf", ".txt"]:
        file_path = os.path.join(UPLOADS_DIR, f"{doc_id}{ext}")
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.info(f"Local file {file_path} deleted.")
            except Exception as e:
                logger.warning(f"Failed to delete local file {file_path}: {str(e)}")
                
    logger.info(f"Document {doc_id} deleted successfully.")
    return {"message": "Document deleted successfully."}

def handle_exception(e: Exception, context: str):
    err_msg = str(e)
    if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
        logger.warning(f"Gemini API Rate limit reached during {context}: {err_msg}")
        raise HTTPException(
            status_code=429,
            detail="Rate limit reached (Gemini API). Please wait 15-30 seconds and try again."
        )
    elif "SSL" in err_msg or "EOF" in err_msg or "connection" in err_msg.lower():
        logger.warning(f"Gemini API SSL/Network error during {context}: {err_msg}")
        raise HTTPException(
            status_code=503,
            detail="Temporary network connection issue with the AI. Please try again in a moment."
        )
    elif "403" in err_msg or "PermissionDenied" in err_msg or "permission" in err_msg.lower() or "not_found" in err_msg.lower():
        logger.warning(f"Gemini API permission/scope error during {context}: {err_msg}")
        raise HTTPException(
            status_code=403,
            detail="Access Denied: This document was uploaded under a different API Key. Please re-upload the file to analyze or chat under your new key."
        )
    logger.error(f"Failed to {context}: {err_msg}")
    raise HTTPException(status_code=500, detail=err_msg)

@app.post("/api/documents/{doc_id}/analyze")
def analyze_document_endpoint(
    doc_id: str,
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key"),
    x_gemini_name: str = Header(default=None, alias="X-Gemini-Name"),
    x_file_name: str = Header(default=None, alias="X-File-Name")
):
    """
    Run full structured AI analysis and persist result in SQLite.
    Returns comprehensive JSON for the dashboard.
    """
    import json
    doc = get_or_create_document(doc_id, x_client_id, x_gemini_name, x_file_name)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Return cached analysis if it exists
    if doc.get("full_analysis"):
        try:
            return json.loads(doc["full_analysis"])
        except Exception:
            pass

    try:
        analysis = generate_full_analysis(doc["gemini_name"], custom_api_key=x_gemini_key)
        update_document_field(doc_id, x_client_id, "full_analysis", json.dumps(analysis))
        return analysis
    except Exception as e:
        err_msg = str(e)
        if "SSL" in err_msg or "EOF" in err_msg or "connection" in err_msg.lower():
            logger.info("SSL/EOF glitch. Retrying generate_full_analysis once...")
            try:
                analysis = generate_full_analysis(doc["gemini_name"], custom_api_key=x_gemini_key)
                update_document_field(doc_id, x_client_id, "full_analysis", json.dumps(analysis))
                return analysis
            except Exception as retry_e:
                handle_exception(retry_e, "full analysis")
        handle_exception(e, "full analysis")

@app.post("/api/documents/{doc_id}/summary")
def get_summary_endpoint(
    doc_id: str,
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key")
):
    """
    Get the AI-generated structured summary.
    """
    doc = get_document(doc_id, x_client_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        summary = generate_summary(doc["gemini_name"], custom_api_key=x_gemini_key)
        update_document_field(doc_id, x_client_id, "summary", summary)
        return {"summary": summary}
    except Exception as e:
        err_msg = str(e)
        if "SSL" in err_msg or "EOF" in err_msg or "connection" in err_msg.lower():
            logger.info("SSL/EOF network glitch detected. Retrying generate_summary once...")
            try:
                summary = generate_summary(doc["gemini_name"], custom_api_key=x_gemini_key)
                update_document_field(doc_id, x_client_id, "summary", summary)
                return {"summary": summary}
            except Exception as retry_e:
                handle_exception(retry_e, "generate summary")
        handle_exception(e, "generate summary")

@app.post("/api/documents/{doc_id}/extract")
def get_extracted_entities(
    doc_id: str,
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key")
):
    """
    Get the AI-extracted entities.
    """
    doc = get_document(doc_id, x_client_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        entities = extract_entities(doc["gemini_name"], custom_api_key=x_gemini_key)
        update_document_field(doc_id, x_client_id, "entities", entities)
        return {"entities": entities}
    except Exception as e:
        err_msg = str(e)
        if "SSL" in err_msg or "EOF" in err_msg or "connection" in err_msg.lower():
            logger.info("SSL/EOF network glitch detected. Retrying extract_entities once...")
            try:
                entities = extract_entities(doc["gemini_name"], custom_api_key=x_gemini_key)
                update_document_field(doc_id, x_client_id, "entities", entities)
                return {"entities": entities}
            except Exception as retry_e:
                handle_exception(retry_e, "extract entities")
        handle_exception(e, "extract entities")

@app.post("/api/documents/{doc_id}/rewrite")
def get_rewritten_text(
    doc_id: str,
    payload: RewritePayload,
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key"),
    x_gemini_name: str = Header(default=None, alias="X-Gemini-Name"),
    x_file_name: str = Header(default=None, alias="X-File-Name")
):
    """
    Get the AI-rewritten text in a specified tone.
    """
    doc = get_or_create_document(doc_id, x_client_id, x_gemini_name, x_file_name)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        rewritten = rewrite_text(doc["gemini_name"], payload.tone, custom_api_key=x_gemini_key)
        
        # Load, update and save rewrite JSON
        import json
        existing_rewrite = {}
        if doc.get("rewrite"):
            try:
                existing_rewrite = json.loads(doc["rewrite"])
            except Exception:
                pass
        existing_rewrite[payload.tone] = rewritten
        update_document_field(doc_id, x_client_id, "rewrite", json.dumps(existing_rewrite))
        
        return {"rewritten": rewritten}
    except Exception as e:
        err_msg = str(e)
        if "SSL" in err_msg or "EOF" in err_msg or "connection" in err_msg.lower():
            logger.info("SSL/EOF network glitch detected. Retrying rewrite_text once...")
            try:
                rewritten = rewrite_text(doc["gemini_name"], payload.tone, custom_api_key=x_gemini_key)
                import json
                existing_rewrite = {}
                if doc.get("rewrite"):
                    try:
                        existing_rewrite = json.loads(doc["rewrite"])
                    except Exception:
                        pass
                existing_rewrite[payload.tone] = rewritten
                update_document_field(doc_id, x_client_id, "rewrite", json.dumps(existing_rewrite))
                return {"rewritten": rewritten}
            except Exception as retry_e:
                handle_exception(retry_e, "rewrite text")
        handle_exception(e, "rewrite text")

@app.post("/api/documents/{doc_id}/chat")
async def chat_with_document(
    doc_id: str,
    payload: ChatPayload,
    x_client_id: str = Header(default="anonymous", alias="X-Client-Id"),
    x_gemini_key: str = Header(default=None, alias="X-Gemini-Key"),
    x_gemini_name: str = Header(default=None, alias="X-Gemini-Name"),
    x_file_name: str = Header(default=None, alias="X-File-Name")
):
    """
    SSE stream endpoint for chat dialogue about the document.
    """
    doc = get_or_create_document(doc_id, x_client_id, x_gemini_name, x_file_name)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    def event_generator():
        try:
            import json
            assistant_response_text = ""
            # Stream tokens
            for token in stream_chat(
                file_name=doc["gemini_name"],
                chat_history=[{"role": item.role, "content": item.content} for item in payload.chat_history],
                user_message=payload.user_message,
                custom_api_key=x_gemini_key
            ):
                assistant_response_text += token
                yield f"data: {json.dumps({'text': token})}\n\n"
            
            # Save turns to SQLite
            existing_history = []
            if doc.get("chat_history"):
                try:
                    existing_history = json.loads(doc["chat_history"])
                except Exception:
                    pass
            existing_history.append({"role": "user", "content": payload.user_message})
            existing_history.append({"role": "assistant", "content": assistant_response_text})
            update_document_field(doc_id, x_client_id, "chat_history", json.dumps(existing_history))
        except Exception as e:
            err_msg = str(e)
            logger.error(f"SSE error: {err_msg}")
            if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                friendly_msg = "Rate limit reached (Gemini API). Please wait 15-30 seconds and try again."
            elif "SSL" in err_msg or "EOF" in err_msg or "connection" in err_msg.lower():
                friendly_msg = "Temporary network connection issue with the AI. Please try again."
            else:
                friendly_msg = err_msg
            import json
            yield f"data: {json.dumps({'error': friendly_msg})}\n\n"
            
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
