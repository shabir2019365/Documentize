import os
import requests

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="static")
CORS(app)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

GEMINI_MODEL = "gemini-2.5-flash"
GROQ_MODEL = "openai/gpt-oss-20b"


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


def call_gemini(messages):
    if not GEMINI_API_KEY:
        return None, "Missing Gemini API key", 500

    system_message = ""
    conversation = []

    for message in messages:
        role = message.get("role", "")
        content = message.get("content", "")

        if role == "system":
            system_message = content

        elif role == "user":
            conversation.append(
                {
                    "role": "user",
                    "parts": [{"text": content}]
                }
            )

        elif role == "assistant":
            conversation.append(
                {
                    "role": "model",
                    "parts": [{"text": content}]
                }
            )

    if system_message:
        conversation.insert(
            0,
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            "System instructions:\n\n"
                            + system_message
                        )
                    }
                ]
            }
        )

    payload = {
        "contents": conversation,
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192
        }
    }

    url = (
        f"https://generativelanguage.googleapis.com/"
        f"v1beta/models/{GEMINI_MODEL}:generateContent"
        f"?key={GEMINI_API_KEY}"
    )

    try:
        response = requests.post(
            url,
            json=payload,
            timeout=60
        )

        if response.status_code == 200:
            data = response.json()

            parts = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [])
            )

            text = "".join(
                part.get("text", "")
                for part in parts
            ).strip()

            return text, None, 200

        return None, response.text, response.status_code

    except requests.RequestException as e:
        return None, str(e), 500


def call_groq(messages):
    if not GROQ_API_KEY:
        return None, "Missing Groq API key", 500

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    groq_messages = []

    for message in messages:
        role = message.get("role")
        content = message.get("content", "")

        if role in ["system", "user", "assistant"]:
            groq_messages.append(
                {
                    "role": role,
                    "content": content
                }
            )

    payload = {
        "model": GROQ_MODEL,
        "messages": groq_messages,
        "temperature": 0.7,
        "max_tokens": 8192
    }

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60
        )

        if response.status_code == 200:
            data = response.json()

            text = (
                data["choices"][0]["message"]["content"]
                .strip()
            )

            return text, None, 200

        return None, response.text, response.status_code

    except requests.RequestException as e:
        return None, str(e), 500


@app.route("/api/chat", methods=["POST"])
def chat():

    data = request.get_json() or {}

    messages = data.get("messages", [])

    if not messages:
        return jsonify(
            error="No messages provided."
        ), 400

    # Safety limit for request size
    if len(messages) > 50:
        messages = messages[-50:]

    text, error, status = call_gemini(messages)

    if status == 200:
        return jsonify(
            text=text,
            provider="Gemini"
        )

    # Gemini rate-limit / temporary failure
    if status in [429, 500, 502, 503]:
        text, error, status = call_groq(messages)

        if status == 200:
            return jsonify(
                text=text,
                provider="Groq"
            )

    return jsonify(
        error=error or "AI request failed."
    ), status


@app.route("/health")
def health():
    return jsonify(
        status="ok",
        gemini=bool(GEMINI_API_KEY),
        groq=bool(GROQ_API_KEY)
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port
    )
