"""
Vercel Function: Chat endpoint with OpenRouter proxy
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import httpx
from datetime import datetime

app = FastAPI()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    user_id: str
    team_id: str
    message: str
    session_id: Optional[str] = None
    include_skills: bool = True
    max_skills: int = 5
    model: Optional[str] = "anthropic/claude-opus-4.5"


class ChatResponse(BaseModel):
    response: str
    skills_used: List[str]
    trace_id: str
    session_id: str


async def call_openrouter(
    api_key: str,
    model: str,
    messages: List[dict],
    site_url: str = "https://llmos-lite.vercel.app"
) -> str:
    """
    Call OpenRouter API with user's API key
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": site_url,
                "X-Title": "LLMos-Lite",
                "Content-Type": "application/json"
            },
            json={
                "model": model,
                "messages": messages
            },
            timeout=60.0
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"OpenRouter API error: {response.text}"
            )

        data = response.json()
        return data["choices"][0]["message"]["content"]


@app.post("/")
async def chat_handler(request: Request):
    """
    Main chat endpoint - proxies to OpenRouter

    Headers:
    - X-API-Key: User's OpenRouter API key
    - X-Model: Model to use (optional, defaults to request body)
    """
    try:
        # Get user's API key from header
        api_key = request.headers.get("X-API-Key")
        if not api_key:
            raise HTTPException(
                status_code=401,
                detail="Missing X-API-Key header. Please provide your OpenRouter API key."
            )

        # Parse request body
        body = await request.json()
        chat_req = ChatRequest(**body)

        # Override model from header if provided
        model = request.headers.get("X-Model") or chat_req.model

        # Generate trace ID
        trace_id = f"trace_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Build context with skills (if enabled)
        skills_used = []
        system_message = "You are a helpful AI assistant for LLMos-Lite."

        if chat_req.include_skills:
            # TODO: Load relevant skills from Vercel Blob
            # For now, use placeholder
            skills_used = ["python-coding", "data-analysis"]
            system_message += "\n\nAvailable skills:\n- Python Coding Best Practices\n- Data Analysis Workflows"

        # Build messages for OpenRouter
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": chat_req.message}
        ]

        # Call OpenRouter
        response_text = await call_openrouter(
            api_key=api_key,
            model=model,
            messages=messages
        )

        # TODO: Save trace to Vercel Blob/KV
        # For now, just return response

        # Return response
        return JSONResponse({
            "response": response_text,
            "skills_used": skills_used,
            "trace_id": trace_id,
            "session_id": chat_req.session_id or "default",
            "model_used": model
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "chat"}


# Vercel expects the FastAPI app to be exported
handler = app
