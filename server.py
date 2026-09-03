import os
import logging
import requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-workspace")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip()

SYSTEM_PROMPT = """You are AI Workspace, a highly capable general-purpose AI assistant.

Give useful, accurate, practical answers. Follow the user's instructions carefully.
Use Markdown where useful: headings, bullets, numbered lists, tables, and fenced code blocks.
For programming questions, provide complete and usable examples.
For business/work questions, be professional and structured.
Do not claim that you performed an action you could not actually perform.
If information is uncertain or missing, clearly say so rather than inventing facts."""

@app.get("/")
def home():
    return send_file(os.path.join(BASE_DIR, "index.html"))

@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "groq_configured": bool(GROQ_API_KEY),
        "gemini_model": GEMINI_MODEL,
        "groq_model": GROQ_MODEL
    })

def normalize_messages(messages):
    cleaned = []
    if not isinstance(messages, list):
        return cleaned

    for message in messages[-30:]:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        content = str(message.get("content", "")).strip()
        if role in ("user", "assistant") and content:
            cleaned.append({"role": role, "content": content})
    return cleaned

def call_gemini(messages):
    if not GEMINI_API_KEY:
        return None, "Gemini API key is not configured.", 500

    contents = []
    for message in messages:
        contents.append({
            "role": "model" if message["role"] == "assistant" else "user",
            "parts": [{"text": message["content"]}]
        })

    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192
        }
    }

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )

    try:
        response = requests.post(url, json=payload, timeout=90)

        if response.ok:
            data = response.json()
            candidates = data.get("candidates") or []
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                answer = "".join(
                    part.get("text", "")
                    for part in parts
                    if isinstance(part, dict)
                ).strip()
                if answer:
                    return answer, None, 200
            return None, "Gemini returned an empty response.", 502

        logger.error("Gemini HTTP %s: %s", response.status_code, response.text[:1000])
        return None, f"Gemini API returned HTTP {response.status_code}.", response.status_code

    except requests.Timeout:
        return None, "Gemini request timed out.", 504
    except requests.RequestException as exc:
        logger.exception("Gemini request failed")
        return None, f"Gemini connection failed: {exc}", 502

def call_groq(messages):
    if not GROQ_API_KEY:
        return None, "Groq API key is not configured.", 500

    api_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    api_messages.extend(messages)

    payload = {
        "model": GROQ_MODEL,
        "messages": api_messages,
        "temperature": 0.7,
        "max_tokens": 8192
    }

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            json=payload,
            headers=headers,
            timeout=90
        )

        if response.ok:
            data = response.json()
            choices = data.get("choices") or []
            if choices:
                answer = (
                    choices[0]
                    .get("message", {})
                    .get("content", "")
                    .strip()
                )
                if answer:
                    return answer, None, 200
            return None, "Groq returned an empty response.", 502

        logger.error("Groq HTTP %s: %s", response.status_code, response.text[:1000])
        return None, f"Groq API returned HTTP {response.status_code}.", response.status_code

    except requests.Timeout:
        return None, "Groq request timed out.", 504
    except requests.RequestException as exc:
        logger.exception("Groq request failed")
        return None, f"Groq connection failed: {exc}", 502

@app.post("/api/chat")
def chat():
    data = request.get_json(silent=True) or {}
    messages = normalize_messages(data.get("messages", []))

    if not messages:
        return jsonify({"ok": False, "error": "Please enter a message."}), 400

    answer, error, status = call_gemini(messages)
    if status == 200:
        return jsonify({
            "ok": True,
            "text": answer,
            "provider": "Gemini",
            "model": GEMINI_MODEL
        })

    if GROQ_API_KEY:
        fallback_answer, fallback_error, fallback_status = call_groq(messages)
        if fallback_status == 200:
            return jsonify({
                "ok": True,
                "text": fallback_answer,
                "provider": "Groq",
                "model": GROQ_MODEL
            })
        error = fallback_error or error
        status = fallback_status

    return jsonify({
        "ok": False,
        "error": error or "The AI service could not complete the request."
    }), status if isinstance(status, int) and 400 <= status <= 599 else 502

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
