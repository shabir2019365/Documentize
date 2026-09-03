import os
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "").strip()
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")

SYSTEM_PROMPT = """You are a highly capable general-purpose AI assistant.
Answer clearly, accurately, and professionally. Use headings, bullets, numbered
lists, tables, and code blocks when they improve clarity. If the user asks for
code, provide complete usable code. If uncertain, say so rather than inventing facts."""

@app.route("/")
def index():
    return send_from_directory(".", "index.html")

def call_gemini(messages):
    if not GEMINI_API_KEY:
        return None, "Missing Gemini API key.", 500

    contents = []
    for m in messages:
        role = m.get("role")
        content = str(m.get("content", "")).strip()
        if not content:
            continue
        contents.append({
            "role": "model" if role == "assistant" else "user",
            "parts": [{"text": content}]
        })

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 8192}
    }

    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}")

    try:
        r = requests.post(url, json=payload, timeout=90)
        if r.status_code == 200:
            data = r.json()
            parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts).strip()
            return (text, None, 200) if text else (None, "Gemini returned an empty response.", 502)
        return None, r.text, r.status_code
    except requests.RequestException as e:
        return None, str(e), 502

def call_groq(messages):
    if not GROQ_API_KEY:
        return None, "Missing Groq API key.", 500

    groq_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in messages:
        if m.get("role") in ("user", "assistant") and str(m.get("content", "")).strip():
            groq_messages.append({"role": m["role"], "content": str(m["content"]).strip()})

    payload = {
        "model": GROQ_MODEL,
        "messages": groq_messages,
        "temperature": 0.7,
        "max_tokens": 8192
    }
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        r = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers, json=payload, timeout=90
        )
        if r.status_code == 200:
            data = r.json()
            text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            return (text, None, 200) if text else (None, "Groq returned an empty response.", 502)
        return None, r.text, r.status_code
    except requests.RequestException as e:
        return None, str(e), 502

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])
    if not isinstance(messages, list) or not messages:
        return jsonify(error="Please enter a message."), 400

    messages = messages[-30:]
    text, error, status = call_gemini(messages)

    if status == 200:
        return jsonify(text=text, provider="Gemini")

    if GROQ_API_KEY and status in (429, 500, 502, 503, 504):
        text, error2, status2 = call_groq(messages)
        if status2 == 200:
            return jsonify(text=text, provider="Groq")
        error, status = error2 or error, status2

    return jsonify(error=error or "The AI service could not complete the request."), status

@app.route("/health")
def health():
    return jsonify(
        status="ok",
        gemini_configured=bool(GEMINI_API_KEY),
        groq_configured=bool(GROQ_API_KEY)
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
