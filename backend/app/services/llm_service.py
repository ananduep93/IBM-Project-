import os
import time
import json
from typing import Generator, List, Dict, Any
from google import genai
from google.genai import types
from google.genai.errors import APIError
import logging

logger = logging.getLogger(__name__)

_client = None

def get_client(custom_api_key: str = None) -> genai.Client:
    if custom_api_key and isinstance(custom_api_key, str) and custom_api_key.strip() and custom_api_key.strip() not in ('null', 'undefined'):
        return genai.Client(api_key=custom_api_key.strip())
    global _client
    if _client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable is not set.")
        _client = genai.Client(api_key=api_key)
    return _client

def upload_file_to_gemini(file_path: str, mime_type: str, custom_api_key: str = None) -> Any:
    client = get_client(custom_api_key)
    logger.info(f"Uploading file {file_path} (MIME: {mime_type}) to Gemini Files API...")
    file_ref = client.files.upload(file=file_path)
    logger.info(f"File uploaded. name={file_ref.name}, uri={file_ref.uri}")
    state = file_ref.state
    retries = 0
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

def delete_file_from_gemini(file_name: str, custom_api_key: str = None) -> None:
    try:
        client = get_client(custom_api_key)
        logger.info(f"Deleting file {file_name} from Gemini Files API...")
        client.files.delete(name=file_name)
    except Exception as e:
        logger.warning(f"Failed to delete file {file_name}: {str(e)}")

def generate_full_analysis(file_name: str, custom_api_key: str = None) -> dict:
    """
    Generates a comprehensive structured analysis of the document as JSON.
    Returns a dict with all insight fields needed for the dashboard.
    """
    client = get_client(custom_api_key)
    file_ref = client.files.get(name=file_name)
    file_part = types.Part.from_uri(file_uri=file_ref.uri, mime_type=file_ref.mime_type)

    prompt = """You are an expert AI document analyst. Analyze this document thoroughly and return ONLY a valid JSON object. No markdown code blocks. No extra text. Just raw JSON.

The JSON must follow this exact structure:
{
  "executive_summary": "A detailed 2-3 paragraph summary of the document's purpose, key arguments, and conclusions",
  "key_points": ["key point 1", "key point 2", "key point 3", "key point 4", "key point 5"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8"],
  "tone": "Professional",
  "tone_breakdown": {"Professional": 60, "Technical": 30, "Formal": 10},
  "reading_time_minutes": 5,
  "word_count": 1200,
  "complexity_score": 72,
  "action_items": ["action item 1", "action item 2", "action item 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"],
  "named_entities": {
    "People": ["person name 1", "person name 2"],
    "Organizations": ["org 1", "org 2"],
    "Locations": ["location 1"],
    "Dates": ["date 1", "date 2"],
    "Topics": ["topic 1", "topic 2"]
  },
  "confidence_score": 91
}

Rules:
- complexity_score: integer 0-100 (0=very simple children's book, 100=highly complex academic paper)
- confidence_score: integer 0-100 (your confidence in analysis accuracy based on document clarity)
- tone_breakdown: values must be percentages that sum to exactly 100, use the 3 most dominant tone dimensions
- reading_time_minutes: integer, based on 238 words/minute average reading speed
- word_count: estimated total word count as integer
- tone: single most dominant tone as string (Professional/Academic/Casual/Technical/Formal/Persuasive/Informative/Narrative)
- named_entities: only include categories with actual found entities, empty lists are ok
- key_points: 4-6 specific, meaningful points
- keywords: 6-12 most important terms/phrases
- action_items: concrete tasks or next steps if any (empty list [] if none found)
- recommendations: suggestions for the reader if any (empty list [] if none)
- Return ONLY the JSON object, absolutely nothing else"""

    logger.info(f"Generating full analysis for {file_name}...")
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=[file_part, types.Part.from_text(text=prompt)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            max_output_tokens=8192,
        )
    )
    
    text = response.text.strip()
    # Strip any markdown code blocks if Gemini adds them
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    if text.endswith("```"):
        text = text[:-3]
    
    return json.loads(text.strip())

def generate_summary(file_name: str, custom_api_key: str = None) -> str:
    client = get_client(custom_api_key)
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
        contents=[file_part, prompt_part],
        config=types.GenerateContentConfig(
            max_output_tokens=4096,
        )
    )
    return response.text

def extract_entities(file_name: str, custom_api_key: str = None) -> str:
    client = get_client(custom_api_key)
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
        contents=[file_part, prompt_part],
        config=types.GenerateContentConfig(
            max_output_tokens=4096,
        )
    )
    return response.text

def rewrite_text(file_name: str, tone: str, custom_api_key: str = None) -> str:
    client = get_client(custom_api_key)
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
        contents=[file_part, prompt_part],
        config=types.GenerateContentConfig(
            max_output_tokens=8192,
        )
    )
    return response.text

def stream_chat(file_name: str, chat_history: List[Dict[str, str]], user_message: str, custom_api_key: str = None) -> Generator[str, None, None]:
    client = get_client(custom_api_key)
    file_ref = client.files.get(name=file_name)
    file_part = types.Part.from_uri(file_uri=file_ref.uri, mime_type=file_ref.mime_type)
    mapped_history = []
    file_inserted = False
    for msg in chat_history:
        role = 'user' if msg['role'] == 'user' else 'model'
        text_part = types.Part.from_text(text=msg['content'])
        if role == 'user' and not file_inserted:
            mapped_history.append(types.Content(role='user', parts=[file_part, text_part]))
            file_inserted = True
        else:
            mapped_history.append(types.Content(role=role, parts=[text_part]))
    user_text_part = types.Part.from_text(text=user_message)
    if not file_inserted:
        mapped_history.append(types.Content(role='user', parts=[file_part, user_text_part]))
    else:
        mapped_history.append(types.Content(role='user', parts=[user_text_part]))
    logger.info(f"Streaming chat session for {file_name}...")
    try:
        response_stream = client.models.generate_content_stream(
            model='gemini-2.5-flash',
            contents=mapped_history,
            config=types.GenerateContentConfig(
                max_output_tokens=4096,
            )
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
