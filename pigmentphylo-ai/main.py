import uuid
import sqlite3
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import os
import requests
import io

try:
    import bcrypt
except ImportError:
    bcrypt = None

try:
    import boto3
except ImportError:
    boto3 = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

app = FastAPI(
    title="PigmentPhylo AI BIO-ARC-772 Backend",
    description="Python FastAPI backend serving health checkpoints, authenticating users, serving chat requests, and notes management.",
    version="1.0.0"
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# JWT configuration constants
SECRET_KEY = "bio-arc-772-super-secret-key-signature"
ALGORITHM = "HS256"

# In-memory user database stores email -> hashed_password
USERS_DB = {}

DATABASE_PATH = "bio_phylo_ai.db"

def init_db():
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            hashed_password TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS corpus_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            filename TEXT,
            s3_url TEXT,
            chunk_count INTEGER,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    
    # Pre-populate USERS_DB from SQLite on load
    cursor.execute("SELECT email, hashed_password FROM users")
    for email, hashed in cursor.fetchall():
        USERS_DB[email.lower()] = hashed
    conn.close()

# Run database setup
init_db()

def get_or_create_user_id(email: str) -> int:
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE email = ?", (email.lower(),))
    row = cursor.fetchone()
    if row:
        user_id = row[0]
    else:
        cursor.execute("INSERT INTO users (email) VALUES (?)", (email.lower(),))
        conn.commit()
        user_id = cursor.lastrowid
    conn.close()
    return user_id


security_scheme = HTTPBearer()

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> dict:
    """
    Dependency that verifies the presence and signature of the JWT token.
    Raises an HTTP 401 Unauthorized if verification fails.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired"
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token"
        )

# Pydantic Schemas for validation
class AuthRequest(BaseModel):
    email: str
    password: str

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage]

class NoteRequest(BaseModel):
    title: str
    body: str
    tag: str

# Try to import Pinecone client
try:
    from pinecone import Pinecone, ServerlessSpec
except ImportError:
    Pinecone = None
    ServerlessSpec = None

# Pinecone & Gemini configuration
PINECONE_INDEX_NAME = os.environ.get("PINECONE_INDEX_NAME", "bio-arc-772")

def get_gemini_embedding(text: str) -> List[float]:
    """Generates 768-dim embeddings using Gemini Embeddings API."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set in the environment.")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={api_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": "models/text-embedding-004",
        "content": {
            "parts": [{"text": text}]
        }
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    res_json = response.json()
    return res_json["embedding"]["values"]

def get_pinecone_index():
    """Retrieves or auto-creates the Pinecone index for vector operations."""
    api_key = os.environ.get("PINECONE_API_KEY")
    if not api_key:
        raise ValueError("PINECONE_API_KEY is not set in the environment.")
    
    if Pinecone is None:
        raise RuntimeError("pinecone-client is not installed on the system.")
        
    pc = Pinecone(api_key=api_key)
    existing_indexes = [idx.name for idx in pc.list_indexes()]
    index_name = PINECONE_INDEX_NAME
    
    if index_name not in existing_indexes:
        try:
            pc.create_index(
                name=index_name,
                dimension=768,
                metric="cosine",
                spec=ServerlessSpec(
                    cloud="aws",
                    region="us-east-1"
                )
            )
        except Exception as err:
            print(f"Index creation failed or limit exceeded: {err}. Attempting fallback to first existing index.")
            if existing_indexes:
                index_name = existing_indexes[0]
            else:
                raise err
                
    return pc.Index(index_name)

def split_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
    """Splits full body text into 500-character chunks with fixed overlap."""
    chunks = []
    if not text:
        return chunks
    start = 0
    text_len = len(text)
    while start < text_len:
        end = start + chunk_size
        chunks.append(text[start:end])
        start += (chunk_size - overlap)
        if end >= text_len:
            break
    return chunks

def search_corpus(query: str) -> List[str]:
    """Retrieves top 3 matching chunks for the given search query from Pinecone."""
    try:
        if not os.environ.get("PINECONE_API_KEY") or not os.environ.get("GEMINI_API_KEY"):
            return []
            
        query_embedding = get_gemini_embedding(query)
        index = get_pinecone_index()
        
        results = index.query(
            vector=query_embedding,
            top_k=3,
            include_metadata=True,
            namespace="bio-arc-772"
        )
        
        chunks = []
        if results and "matches" in results:
            for match in results["matches"]:
                if match.get("metadata") and "text" in match["metadata"]:
                    chunks.append(match["metadata"]["text"])
        return chunks
    except Exception as e:
        print(f"Error querying Pinecone corpus: {e}")
        return []

def generate_chat_reply(message: str, history: List[ChatMessage], context: str) -> str:
    """Attempts the official Gemini chat generation using exoplanetary context."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return ""
        
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
        headers = {"Content-Type": "application/json"}
        
        contents = []
        # Prepopulate existing history in the format Gemini expects
        for msg in history:
            role = "user" if msg.role == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg.content}]
            })
            
        # Format the user query with matching context prepended
        full_user_content = ""
        if context:
            full_user_content += f"[CONTEXT FROM CORPUS]\n{context}\n[END OF CONTEXT]\n\n"
        full_user_content += message
        
        contents.append({
            "role": "user",
            "parts": [{"text": full_user_content}]
        })
        
        response = requests.post(
            url,
            json={"contents": contents},
            headers=headers,
            timeout=30
        )
        response.raise_for_status()
        res_json = response.json()
        
        return res_json["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as err:
        print(f"Failed to generate Gemini reply: {err}")
        return ""

# Authentication Endpoints
@app.post("/auth/register")
def register(request: AuthRequest):
    """
    Registers a new user, hashes the password via bcrypt (or falls back to sha256 with salt) and stores it in memory.
    """
    email = request.email.strip().lower()
    if not email or not request.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password cannot be empty"
        )
    if email in USERS_DB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered"
        )
    
    if bcrypt:
        # Hash password with bcrypt
        password_bytes = request.password.encode('utf-8')
        salt = bcrypt.gensalt()
        hashed_password = bcrypt.hashpw(password_bytes, salt)
        hashed_password_str = hashed_password.decode('utf-8')
    else:
        # Fallback pure-python sha255/sha256 hashing
        import hashlib
        salt_str = "bio-arc-772-fallback-salt"
        hashed_password_str = "sha256:" + hashlib.sha256((request.password + salt_str).encode('utf-8')).hexdigest()
    
    # Store string representation of hash
    USERS_DB[email] = hashed_password_str
    
    # Write to SQLite database
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO users (email, hashed_password) VALUES (?, ?)",
        (email, hashed_password_str)
    )
    conn.commit()
    conn.close()
    
    return {
        "message": "User registered successfully",
        "email": email
    }

@app.post("/auth/login")
def login(request: AuthRequest):
    """
    Authenticates username and password, then returns a signed JWT.
    """
    email = request.email.strip().lower()
    if email not in USERS_DB:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    hashed_password_str = USERS_DB[email]
    
    if hashed_password_str.startswith("sha255:") or hashed_password_str.startswith("sha256:"):
        import hashlib
        salt_str = "bio-arc-772-fallback-salt"
        fallback_hash = "sha256:" + hashlib.sha256((request.password + salt_str).encode('utf-8')).hexdigest()
        # also check sha255/sha256 prefix
        possible_hash_1 = "sha256:" + hashlib.sha256((request.password + salt_str).encode('utf-8')).hexdigest()
        possible_hash_2 = "sha255:" + hashlib.sha256((request.password + salt_str).encode('utf-8')).hexdigest()
        if fallback_hash != hashed_password_str and possible_hash_1 != hashed_password_str and possible_hash_2 != hashed_password_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
    else:
        if bcrypt:
            try:
                password_bytes = request.password.encode('utf-8')
                hashed_bytes = hashed_password_str.encode('utf-8')
                if not bcrypt.checkpw(password_bytes, hashed_bytes):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid email or password"
                    )
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid email or password"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Password cannot be verified because bcrypt is not installed on this system."
            )
    
    # Generate signed JWT token valid for 1 hour
    expiration = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = {
        "sub": email,
        "exp": expiration
    }
    
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    
    return {
        "access_token": token,
        "token_type": "bearer"
    }

# Protected Routes
@app.get("/health")
def health_check():
    """
    Returns API operational status and configuration signature.
    """
    return {
        "status": "ok",
        "project": "BIO-ARC-772"
    }

def generate_chat_stream(user_input: str, history: List[ChatMessage], context_str: str):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        yield "data: Error: GEMINI_API_KEY is not configured in the host environment.\n\n"
        return

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key={api_key}&alt=sse"
    headers = {"Content-Type": "application/json"}

    system_prompt = (
        "You are PigmentPhylo AI, a RAG-based bioinformatic assistant specialising in "
        "phylochemical categorisation of biological pigments including chlorophylls carotenoids "
        "anthocyanins and tetrapyrroles. For every pigment query respond with two parts: "
        "first a scientific explanation tagged RAG, Molecular, or Phylo; second a JSON block "
        "on its own line starting with PIGMENT_DATA: containing molecule_name, formula, "
        "molecular_weight, absorption_peaks as array, phylo_confidence as number, "
        "divergence_date, and suggested_evo_branches as array of objects each with name and mya fields."
    )

    contents = []
    for msg in history:
        role = "user" if msg.role == "user" else "model"
        contents.append({
            "role": role,
            "parts": [{"text": msg.content}]
        })

    # Prepare user prompt
    full_user_content = ""
    if context_str:
        full_user_content += f"[CONTEXT FROM CORPUS]\n{context_str}\n[END OF CONTEXT]\n\n"
    full_user_content += user_input

    contents.append({
        "role": "user",
        "parts": [{"text": full_user_content}]
    })

    payload = {
        "contents": contents,
        "systemInstruction": {
            "parts": [{"text": system_prompt}]
        }
    }

    try:
        response = requests.post(url, json=payload, headers=headers, stream=True, timeout=60)
        response.raise_for_status()

        import json
        pending_text = ""
        pigment_mode = False
        pigment_buffer = ""

        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            decoded = line.strip()
            if decoded.startswith("data:"):
                data_json_str = decoded[len("data:"):].strip()
                if not data_json_str:
                    continue
                try:
                    chunk_data = json.loads(data_json_str)
                    text_chunk = chunk_data["candidates"][0]["content"]["parts"][0]["text"]
                except Exception:
                    continue

                if pigment_mode:
                    pigment_buffer += text_chunk
                else:
                    pending_text += text_chunk
                    if "PIGMENT_DATA:" in pending_text:
                        pigment_mode = True
                        parts = pending_text.split("PIGMENT_DATA:", 1)
                        text_part = parts[0]
                        pigment_buffer += parts[1]

                        if text_part:
                            yield f"data: {text_part}\n\n"
                        pending_text = ""
                    else:
                        if len(pending_text) > 15:
                            to_send = pending_text[:-15]
                            pending_text = pending_text[-15:]
                            yield f"data: {to_send}\n\n"

        if not pigment_mode and pending_text:
            yield f"data: {pending_text}\n\n"

        if pigment_buffer:
            clean_json = pigment_buffer.strip()
            if clean_json.startswith("```json"):
                clean_json = clean_json[7:]
            elif clean_json.startswith("```"):
                clean_json = clean_json[3:]
            if clean_json.endswith("```"):
                clean_json = clean_json[:-3]
            clean_json = clean_json.strip()

            try:
                parsed = json.loads(clean_json)
                yield f"data: {json.dumps(parsed)}\n\n"
            except Exception:
                yield f"data: {clean_json}\n\n"

    except Exception as err:
        print(f"Error streaming from Gemini: {err}")
        yield f"data: [Error: Core phylogenetic streaming connection interrupted: {str(err)}]\n\n"

@app.post("/chat")
def chat_interaction(request: ChatRequest, token_payload: dict = Depends(verify_token)):
    """
    Handles exoplanetary chatbot requests, fetching top-3 context chunks from Pinecone corpus
    and combining them with history and query using Gemini stream model.
    """
    user_input = request.message
    
    # 1. Search corpus for top 3 matching chunks
    matching_chunks = search_corpus(user_input)
    context_str = ""
    if matching_chunks:
        context_str = "\n".join(matching_chunks)
        
    return StreamingResponse(
        generate_chat_stream(user_input, request.history, context_str),
        media_type="text/event-stream"
    )

def upload_to_s3(file_bytes: bytes, filename: str) -> str:
    access_key = os.environ.get("AWS_ACCESS_KEY")
    secret_key = os.environ.get("AWS_SECRET_KEY")
    bucket_name = os.environ.get("S3_BUCKET_NAME")
    
    if not bucket_name:
        raise ValueError("S3_BUCKET_NAME is not configured in environment.")
        
    s3_kwargs = {}
    if access_key and secret_key:
        s3_kwargs["aws_access_key_id"] = access_key
        s3_kwargs["aws_secret_access_key"] = secret_key
        
    session = boto3.Session(**s3_kwargs)
    s3_client = session.client("s3")
    
    file_id = str(uuid.uuid4())
    s3_key = f"corpus/{file_id}_{filename}"
    
    s3_client.put_object(
        Bucket=bucket_name,
        Key=s3_key,
        Body=file_bytes,
        ContentType="application/pdf"
    )
    
    region = s3_client.meta.region_name or "us-east-1"
    url = f"https://{bucket_name}.s3.{region}.amazonaws.com/{s3_key}"
    return url

@app.post("/corpus/upload")
def upload_corpus(file: UploadFile = File(...), token_payload: dict = Depends(verify_token)):
    """
    Accepts a PDF, extracts text with pdfplumber, splits into 500-character overlapping chunks,
    generates embeddings with Gemini Embeddings API, and stores them in Pinecone under namespace bio-arc-772.
    Protected by token verification. Saves the file to boto3 AWS S3 first and stores metadata.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported by the exoplanetary processor."
        )
    
    try:
        # Read file bytes in memory
        contents = file.file.read()
        
        # Get or create SQLite user ID
        email = token_payload.get("sub")
        if not email:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload credentials."
            )
        user_id = get_or_create_user_id(email)

        # Upload the PDF to AWS S3 before processing
        try:
            s3_url = upload_to_s3(contents, file.filename)
        except Exception as s3_err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload raw PDF file to S3: {str(s3_err)}"
            )

        # Open PDF text with pdfplumber
        extracted_text = ""
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        
        if not extracted_text.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No extractable text found in the PDF."
            )
            
        # Split into 500-character overlapping chunks (overlap say 100 character border)
        chunks = split_text(extracted_text, chunk_size=500, overlap=100)
        
        if not chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not split exoplanetary text into overlapping chunks."
            )
            
        # Generate embeddings and compile data vectors
        upsert_data = []
        for i, chunk in enumerate(chunks):
            chunk_text = chunk.strip()
            if not chunk_text:
                continue
                
            embedding = get_gemini_embedding(chunk_text)
            chunk_id = f"chunk-{uuid.uuid4()}"
            upsert_data.append((chunk_id, embedding, {"text": chunk_text}))
            
        if upsert_data:
            index = get_pinecone_index()
            # Upsert into Pinecone under namespace bio-arc-772
            index.upsert(vectors=upsert_data, namespace="bio-arc-772")
            
        # Store S3 metadata in corpus_files SQLite table
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO corpus_files (user_id, filename, s3_url, chunk_count)
            VALUES (?, ?, ?, ?)
        """, (user_id, file.filename, s3_url, len(upsert_data)))
        conn.commit()
        conn.close()

        return {
            "success": True,
            "filename": file.filename,
            "s3_url": s3_url,
            "num_chunks": len(upsert_data),
            "message": f"Successfully processed '{file.filename}', saved to AWS S3, and stored {len(upsert_data)} embeddings in Pinecone namespace 'bio-arc-772'."
        }
        
    except HTTPException as http_err:
        raise http_err
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process exoplanetary corpus upload: {str(e)}"
        )

@app.get("/corpus")
def list_corpus_files(token_payload: dict = Depends(verify_token)):
    """
    Lists uploaded PDF files and their corresponding S3 storage locations for the authenticated user.
    """
    email = token_payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload."
        )
    user_id = get_or_create_user_id(email)
    
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, filename, s3_url, chunk_count, uploaded_at 
        FROM corpus_files 
        WHERE user_id = ? 
        ORDER BY uploaded_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    files = []
    for r in rows:
        files.append({
            "id": r[0],
            "filename": r[1],
            "s3_url": r[2],
            "chunk_count": r[3],
            "uploaded_at": r[4]
        })
    return {"files": files}

@app.post("/notes")
def save_note(request: NoteRequest, token_payload: dict = Depends(verify_token)):
    """
    Accepts title, body, and tag and returns a generated uuid with confirmation saving. Protected by token verification.
    """
    note_id = str(uuid.uuid4())
    return {
        "uuid": note_id,
        "saved": True,
        "title": request.title,
        "tag": request.tag
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
