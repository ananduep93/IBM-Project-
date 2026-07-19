import os
import sqlite3
import logging
import time

logger = logging.getLogger(__name__)

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../app.db"))

def get_db_connection():
    """
    Creates and returns a connection to the SQLite database.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Enables access by column name
    return conn

def init_db():
    """
    Initializes the database schema if it doesn't already exist.
    """
    logger.info(f"Initializing database at: {DB_PATH}")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            client_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            gemini_name TEXT NOT NULL,
            size INTEGER NOT NULL,
            uploaded_at REAL NOT NULL
        )
    """)
    # Add index on client_id for fast lookups
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_client_id ON documents(client_id)")
    
    # Check and add new columns if they do not exist
    cursor.execute("PRAGMA table_info(documents)")
    columns = [row[1] for row in cursor.fetchall()]
    
    if "summary" not in columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN summary TEXT")
        logger.info("Added 'summary' column to documents table.")
    if "entities" not in columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN entities TEXT")
        logger.info("Added 'entities' column to documents table.")
    if "rewrite" not in columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN rewrite TEXT")
        logger.info("Added 'rewrite' column to documents table.")
    if "chat_history" not in columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN chat_history TEXT")
        logger.info("Added 'chat_history' column to documents table.")
    if "full_analysis" not in columns:
        cursor.execute("ALTER TABLE documents ADD COLUMN full_analysis TEXT")
        logger.info("Added 'full_analysis' column to documents table.")
        
    conn.commit()
    conn.close()

def add_document(doc_id: str, client_id: str, filename: str, mime_type: str, gemini_name: str, size: int) -> dict:
    """
    Inserts a new document metadata record into the database.
    """
    uploaded_at = time.time()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO documents (id, client_id, filename, mime_type, gemini_name, size, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (doc_id, client_id, filename, mime_type, gemini_name, size, uploaded_at))
    conn.commit()
    conn.close()
    
    return {
        "id": doc_id,
        "client_id": client_id,
        "filename": filename,
        "mime_type": mime_type,
        "gemini_name": gemini_name,
        "size": size,
        "uploaded_at": uploaded_at
    }

def get_documents(client_id: str) -> list:
    """
    Retrieves all document metadata records matching a specific client_id.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, filename, mime_type, gemini_name, size, uploaded_at 
        FROM documents 
        WHERE client_id = ? 
        ORDER BY uploaded_at DESC
    """, (client_id,))
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def get_document(doc_id: str, client_id: str) -> dict:
    """
    Retrieves a single document metadata record matching doc_id and client_id.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, filename, mime_type, gemini_name, size, uploaded_at, summary, entities, rewrite, chat_history, full_analysis
        FROM documents 
        WHERE id = ? AND client_id = ?
    """, (doc_id, client_id))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return dict(row)
    return None

def update_document_field(doc_id: str, client_id: str, field_name: str, value: str):
    """
    Updates a specific field of a document record.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(f"UPDATE documents SET {field_name} = ? WHERE id = ? AND client_id = ?", (value, doc_id, client_id))
    conn.commit()
    conn.close()

def delete_document_record(doc_id: str, client_id: str) -> str:
    """
    Deletes a document record and returns its gemini_name for cleanup, if found.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get gemini_name first to return it
    cursor.execute("SELECT gemini_name FROM documents WHERE id = ? AND client_id = ?", (doc_id, client_id))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
        return None
        
    gemini_name = row["gemini_name"]
    
    # Delete the record
    cursor.execute("DELETE FROM documents WHERE id = ? AND client_id = ?", (doc_id, client_id))
    conn.commit()
    conn.close()
    
    return gemini_name
