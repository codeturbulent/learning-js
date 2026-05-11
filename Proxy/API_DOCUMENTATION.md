# Proxy API Documentation

This document provides technical specifications for interacting with the LLM Proxy Service. This service acts as a bridge to OpenAI and Google Gemini, providing standardized inputs and outputs for different application "system types" (voice, chat, etc.).

## Base Configuration

- **Endpoint:** `POST /`
- **Content-Type:** `application/json`

---

## Request Structure

The request body must be a JSON object containing the following fields:

### Required Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `model` | `string` | The LLM provider to use. Supported: `"openai"`, `"gemini"`. (`"claude"` is currently a stub). |
| `input` | `string` | The user's message or query. |

### Optional Contextual Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `systemtype` | `string` | Predefined behavior mode. Options: `"voice"`, `"advanced voice"`, `"chat"`, `"advanced chat"`, `"clarification"`. |
| `userinstruction` | `string` | Specific role or persona for the assistant (used in `chat` and `advanced chat`). |
| `depth` | `string` | Contextual depth or focus (used in `chat` and `advanced chat`). |
| `instructions` | `string` | Custom system prompt. Used if `systemtype` is not provided or recognized. |
| `tools` | `array` | Custom tool definitions (Function Calling). Used if `systemtype` is not provided. |

---

## System Types & Predefined Behaviors

The `systemtype` field triggers specific system prompts and tool sets:

| System Type | Response Mode | Predefined Tools |
| :--- | :--- | :--- |
| `voice` | JSON | `document_navigation_response` (Basic) |
| `advanced voice`| JSON | Navigation, Notes, Content, Topic, Search |
| `chat` | **Streaming** | None |
| `advanced chat` | **Streaming** | Notes, Content, Search |
| `clarification` | JSON | None |

> **Note:** When `systemtype` is `"chat"` or `"advanced chat"`, the server automatically switches to **Streaming (Server-Sent Events)**.

---

## Output Formats

### 1. Standard JSON Response
Used for non-streaming modes (e.g., `voice`, `clarification`).

**Success Structure:**
```json
{
  "text": "Optional verbal response content (primarily OpenAI)",
  "toolreturn": {
    "role": "assistant",
    "content": "...",
    "parts": [...]
  },
  "tools": [
    {
      "name": "function_name",
      "args": { "param": "value" }
    }
  ]
}
```

### 2. Streaming Response (SSE)
Used for `chat` and `advanced chat`. The `Content-Type` will be `text/event-stream`.

**Chunk Formats:**
- **Text Chunk:** `data: {"text": "Hello"}`
- **Tool Call Chunk:** `data: {"tool_calls": [{"name": "...", "args": {...}}]}`
- **Termination:** `data: [DONE]`

---

## Implementation Examples

### OpenAI Advanced Voice Request
```bash
curl -X POST http://localhost:5050/ \
-H "Content-Type: application/json" \
-d '{
  "model": "openai",
  "systemtype": "advanced voice",
  "input": "Go to page 5 and read it."
}'
```

### Gemini Advanced Chat (Streaming)
```bash
curl -X POST http://localhost:5050/ \
-H "Content-Type: application/json" \
-d '{
  "model": "gemini",
  "systemtype": "advanced chat",
  "userinstruction": "expert researcher",
  "depth": "academic",
  "input": "Summarize the highlights on page 10."
}'
```

---

## Python Implementation Examples

### 1. Standard JSON Request (OpenAI Voice)
```python
import requests

url = "http://localhost:5050/"
payload = {
    "model": "openai",
    "systemtype": "voice",
    "input": "Go to the next page and tell me what you see."
}

response = requests.post(url, json=payload)

if response.status_code == 200:
    data = response.json()
    print("Text Response:", data.get("text"))
    print("Tools Called:", data.get("tools"))
else:
    print(f"Error {response.status_code}: {response.text}")
```

### 2. Streaming Request (Gemini Advanced Chat)
```python
import requests
import json

url = "http://localhost:5050/"
payload = {
    "model": "gemini",
    "systemtype": "advanced chat",
    "userinstruction": "friendly tutor",
    "depth": "beginner",
    "input": "Can you explain the diagram on page 3?"
}

# Must use stream=True for SSE
response = requests.post(url, json=payload, stream=True)

for line in response.iter_lines():
    if line:
        decoded_line = line.decode('utf-8')
        if decoded_line.startswith('data: '):
            content = decoded_line[6:] # Remove 'data: ' prefix
            if content == "[DONE]":
                break
            
            try:
                data = json.loads(content)
                if "text" in data:
                    print(data["text"], end="", flush=True)
                elif "tool_calls" in data:
                    print("\nTool Call:", data["tool_calls"])
            except json.JSONDecodeError:
                continue
```

---

## Technical Considerations

1. **Tool Transformation:** The proxy automatically converts standard JSON tool definitions into the specific formats required by Google Vertex AI (for Gemini) and OpenAI.
2. **Error Handling:** Errors return a standard JSON object with an `error` and `message` field.
   ```json
   {
     "error": "Invalid Request",
     "message": "Missing 'input' in request body"
   }
   ```
3. **Hardcoded Keys:** Current implementation uses hardcoded API keys in `server.js`, `models/gemini.js`, and `models/openai.js`. These should be moved to environment variables in production.
4. **Fallback:** If `model` is not specified or recognized, the server defaults to a legacy OpenAI endpoint.

---

## Tool Definitions Reference

- `document_navigation_response`: Handles movement (forward/backward/target page) and intent classification.
- `getUserNotesAndHighlights`: Filters notes by keyword or page.
- `getPageContent`: Retrieves full text of specified pages.
- `getTopicNavigationInfo`: Locates specific topics.
- `searchPdfContent`: Full-text search across the document.
