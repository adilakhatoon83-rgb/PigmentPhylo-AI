from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os

app = FastAPI(title="PigmentPhylo AI BIO-ARC-772")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatMessage(BaseModel):
    message: str
    history: Optional[List] = []

class NoteInput(BaseModel):
    title: str
    body: str
    tag: str

@app.get("/health")
def health():
    return {"status": "ok", "project": "BIO-ARC-772"}

@app.post("/chat")
def chat(data: ChatMessage):
    return {
        "reply": f"PigmentPhylo AI received: {data.message}",
        "tag": "RAG"
    }

@app.post("/notes")
def save_note(note: NoteInput):
    import uuid
    return {"id": str(uuid.uuid4()), "saved": True}
