"""
Vercel Serverless Function: Chat endpoint with OpenRouter proxy
Uses native Vercel Python handler (no FastAPI)
"""
from http.server import BaseHTTPRequestHandler
import json
import httpx
from datetime import datetime
from urllib.parse import parse_qs


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        """Handle POST requests to /api/chat"""
        try:
            # Get user's API key from header
            api_key = self.headers.get("X-API-Key")
            if not api_key:
                self.send_error(401, "Missing X-API-Key header")
                return

            # Parse request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            user_id = data.get("user_id")
            message = data.get("message")
            model = self.headers.get("X-Model") or data.get("model", "anthropic/claude-opus-4.5")

            if not message:
                self.send_error(400, "Missing 'message' in request body")
                return

            # Generate trace ID
            trace_id = f"trace_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            # Build messages for OpenRouter
            messages = [
                {"role": "system", "content": "You are a helpful AI assistant for LLMos-Lite."},
                {"role": "user", "content": message}
            ]

            # Call OpenRouter
            response_text = self.call_openrouter(api_key, model, messages)

            # Send response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()

            response_data = {
                "response": response_text,
                "skills_used": [],
                "trace_id": trace_id,
                "session_id": data.get("session_id", "default"),
                "model_used": model
            }

            self.wfile.write(json.dumps(response_data).encode())

        except Exception as e:
            self.send_error(500, str(e))

    def do_GET(self):
        """Health check endpoint"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "service": "chat"}).encode())

    def call_openrouter(self, api_key: str, model: str, messages: list) -> str:
        """Call OpenRouter API"""
        import asyncio
        return asyncio.run(self._async_call_openrouter(api_key, model, messages))

    async def _async_call_openrouter(self, api_key: str, model: str, messages: list) -> str:
        """Async call to OpenRouter"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "https://llmos-lite.vercel.app",
                    "X-Title": "LLMos-Lite",
                    "Content-Type": "application/json"
                },
                json={"model": model, "messages": messages},
                timeout=60.0
            )

            if response.status_code != 200:
                raise Exception(f"OpenRouter API error: {response.text}")

            data = response.json()
            return data["choices"][0]["message"]["content"]
