# AI Workspace

This build intentionally keeps the complete frontend (HTML + CSS + JavaScript)
inside `index.html`. That removes the static-file loading failure that caused the
unstyled page shown in the prior deployment.

## Render

Build command:
pip install -r requirements.txt

Start command:
python server.py

Environment variables:
GEMINI_API_KEY=...
GROQ_API_KEY=...   # optional fallback

Optional:
GEMINI_MODEL=gemini-2.5-flash
GROQ_MODEL=openai/gpt-oss-20b

Health endpoint:
/health

Chat endpoint:
POST /api/chat
