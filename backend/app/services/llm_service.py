import os
import time
from typing import Generator, List, Dict, Any
from google import genai
from google.genai import types
from google.genai.errors import APIError
import logging

logger = logging.getLogger(__name__)

_client = None

def get_client() -> genai.Client:
    """
    Lazily initializes the Google GenAI client.
    """
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set. Please configure it in your .env file.")
        # Note: genai.Client can be initialized with an explicit api_key
        _client = genai.Client(api_key=api_key)
    return _client

def upload_file_to_gemini(file_path: str, mime_type: str) -> Any:
    """
    Uploads a local file to the Gemini Files API.
    Blocks until the file status is 'ACTIVE' (ready for inference).
    """
    client = get_client()
    logger.info(f"Uploading file {file_path} (MIME: {mime_type}) to Gemini Files API...")
    
    file_ref = client.files.upload(file=file_path)
    logger.info(f"File uploaded. name={file_ref.name}, uri={file_ref.uri}")
    
    # Wait for the file to be processed
    state = file_ref.state
    retries = 0
    # States can be: PROCESSING, ACTIVE, FAILED
    while state.name == "PROCESSING" and retries < 15:
        logger.info(f"File is processing, waiting... (retry {retries+1})")
        time.sleep(2)
        file_ref = client.files.get(name=file_ref.name)
        state = file_ref.state
        retries += 1
        
    if state.name == "FAILED":
        raise Exception(f"File processing failed on Gemini servers: {file_ref.error.message}")
        
    logger.info(f"File {file_ref.name} is ACTIVE and ready.")
    return file_ref

def delete_file_from_gemini(file_name: str) -> None:
    """
    Deletes a file from the Gemini Files API to clean up storage.
    """
    try:
        client = get_client()
        logger.info(f"Deleting file {file_name} from Gemini Files API...")
        client.files.delete(name=file_name)
    except Exception as e:
        logger.warning(f"Failed to delete file {file_name}: {str(e)}")

def generate_summary(file_name: str) -> str:
    """
    Generates a structured summary of the uploaded document.
    """
    client = get_client()
    file_ref = client.files.get(name=file_name)
    
    file_part = types.Part.from_uri(file_uri=file_ref.uri, mime_type=file_ref.mime_type)
    prompt_part = types.Part.from_text(text=(
        "You are an expert document analyzer. Provide a professional, detailed summary of the attached document. "
        "Include the following sections:\n"
        "1. **Executive Summary**: A high-level overview of the document's purpose and scope.\n"
        "2. **Key Takeaways**: Bullet points highlighting the most critical findings, agreements, or points.\n"
        "3. **Key Dates & Metrics**: Summarize any important numbers, statistics, dates, or financial data found.\n"
        "Format the output using clear markdown headers and lists."
    ))
    
    logger.info(f"Generating summary for {file_name}...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[file_part, prompt_part]
    )
    return response.text

def extract_entities(file_name: str) -> str:
    """
    Extracts key entities (people, dates, organizations, tasks, etc.) from the document.
    """
    client = get_client()
    file_ref = client.files.get(name=file_name)
    
    file_part = types.Part.from_uri(file_uri=file_ref.uri, mime_type=file_ref.mime_type)
    prompt_part = types.Part.from_text(text=(
        "Identify and extract key entities from the attached document. Group them into the following categories:\n"
        "- **People**: Names of individuals mentioned.\n"
        "- **Organizations**: Companies, government bodies, institutions, groups.\n"
        "- **Dates & Deadlines**: Specific dates, years, timelines, milestones.\n"
        "- **Action Items & Key Tasks**: Things that need to be done, responsibilities assigned.\n"
        "- **Monetary Values & Financials**: Prices, budget amounts, salaries, currencies.\n\n"
        "Format the output as a clean markdown table for each category with two columns: 'Entity/Value' and 'Context/Description'."
    ))
    
    logger.info(f"Extracting entities for {file_name}...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[file_part, prompt_part]
    )
    return response.text

def rewrite_text(file_name: str, tone: str) -> str:
    """
    Rewrites the document content in the specified tone.
    """
    client = get_client()
    file_ref = client.files.get(name=file_name)
    
    file_part = types.Part.from_uri(file_uri=file_ref.uri, mime_type=file_ref.mime_type)
    prompt_part = types.Part.from_text(text=(
        f"Rewrite the key sections of the attached document in a {tone} tone. "
        "Maintain the original facts, figures, and meaning, but alter the writing style, vocabulary, and structure "
        "to match the requested tone. Provide a brief explanation of the style changes made at the end."
    ))
    
    logger.info(f"Rewriting {file_name} in tone '{tone}'...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[file_part, prompt_part]
    )
    return response.text

def stream_chat(file_name: str, chat_history: List[Dict[str, str]], user_message: str) -> Generator[str, None, None]:
    """
    Streams conversational Q&A response using the uploaded document context.
    """
    client = get_client()
    file_ref = client.files.get(name=file_name)
    
    file_part = types.Part.from_uri(file_uri=file_ref.uri, mime_type=file_ref.mime_type)
    
    # Map chat_history (user/assistant) to Gemini structure (user/model)
    mapped_history = []
    file_inserted = False
    
    for msg in chat_history:
        role = 'user' if msg['role'] == 'user' else 'model'
        text_part = types.Part.from_text(text=msg['content'])
        if role == 'user' and not file_inserted:
            # Associate file with the first user message
            mapped_history.append(
                types.Content(
                    role='user',
                    parts=[file_part, text_part]
                )
            )
            file_inserted = True
        else:
            mapped_history.append(
                types.Content(
                    role=role,
                    parts=[text_part]
                )
            )
            
    # If the history was empty, insert file reference with current user message
    user_text_part = types.Part.from_text(text=user_message)
    if not file_inserted:
        mapped_history.append(
            types.Content(
                role='user',
                parts=[file_part, user_text_part]
            )
        )
    else:
        mapped_history.append(
            types.Content(
                role='user',
                parts=[user_text_part]
            )
        )
        
    logger.info(f"Streaming chat session for {file_name}...")
    try:
        response_stream = client.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=mapped_history
        )
        for chunk in response_stream:
            if chunk.text:
                yield chunk.text
    except APIError as e:
        logger.error(f"Gemini API Error in stream_chat: {str(e)}")
        yield f"**API Error:** {str(e)}"
    except Exception as e:
        logger.error(f"Unexpected error in stream_chat: {str(e)}")
        yield f"**Error:** {str(e)}"
