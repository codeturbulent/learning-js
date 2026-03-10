const express = require("express")
var cors = require('cors')


var app = express()
app.use(cors())
var port = 5050
app.use(express.json());
app.get('/', async (req, res) => {
    res.send("The service is working")
})

var model = {
    "openai": "gpt-4.1-mini",
    "claude": "gpt-4.1-mini",
    "gemini": "gpt-4.1-mini",
}


app.post('/', async (req, res) => {
    try {
        console.log("Incoming Body:", req.body);
        const promptMap = {
            "voice": SYSTEM_PROMPTS.VOICE,
            "advanced voice": SYSTEM_PROMPTS.ADVANCED_VOICE,
            "chat": SYSTEM_PROMPTS.CHAT(req.body.userinstruction, req.body.depth),
            "advanced chat": SYSTEM_PROMPTS.ADVANCED_CHAT(req.body.userinstruction, req.body.depth),
            "clarification": SYSTEM_PROMPTS.CLARIFICATION
        };
        const tools = {
            "voice": [TOOLS.DOCUMENTNAVIGATION(req.body.systemtype)],
            "advanced voice": [TOOLS.DOCUMENTNAVIGATION(req.body.systemtype), TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.GETTOPICNAVIGATION, TOOLS.SEARCHPDFCONTENT],
            "chat": null,
            "advanced chat": [TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
        }
        console.log(promptMap[req.body.systemtype])
        console.log(tools[req.body.systemtype])
        if (req.body.modeltype == "openai") {
            console.log("openai is requested")
            openairesp = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                    // "Authorization": `Bearer ${secrets.openaiApiKey}`,
                    "Authorization": `Bearer hi-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`,

                    "Content-Type": "application/json",
                    "Accept": req.headers.accept || "application/json",
                },
                body: JSON.stringify({
                    "model": model.openai,
                    "instructions": promptMap[req.body.systemtype],
                    "input": req.body.userquery,
                    "tools": tools[req.body.systemtype],
                    "parallel_tool_calls": false,
                    "max_tool_calls": 3,
                    "temperature": 0.7,
                    "max_output_tokens": 2048,
                    "tool_choice": "required",
                }),
            })
        } else if (req.body.modeltype == "claude") {
            console.log("claude is requested")

        } else if (req.body.modeltype == "gemini") {
            console.log("gemini is requested")

        } else {
            console.log("fallback for the older versions")
            const openaiRes = await fetch(
                "https://api.openai.com/v1/responses",
                {
                    method: "POST",
                    headers: {
                        // "Authorization": `Bearer ${secrets.openaiApiKey}`,
                        "Content-Type": "application/json",
                        "Accept": req.headers.accept || "application/json",
                    },
                    body: JSON.stringify(req.body),
                }
            );
            const contentType = openaiRes.headers.get("content-type") || "";
            // 🔴 STREAMING RESPONSE (SSE)
            if (contentType.includes("text/event-stream")) {
                res.status(openaiRes.status);
                res.setHeader("Content-Type", "text/event-stream");
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("Connection", "keep-alive");

                if (!openaiRes.body) {
                    throw new Error("Streaming response has no body");
                }

                const webStream = openaiRes.body;
                const nodeStream = Readable.fromWeb(webStream);
                nodeStream.pipe(res);
                return;
            }
            // 🔵 NON-STREAMING RESPONSE (JSON)
            const json = await openaiRes.json(); // body read exactly once
            res.status(openaiRes.status).json(json);
        }
    } catch (err) {
        console.error("responsesProxy error:", err);
        res.status(500).json({
            error: "Proxy failure",
            message: err,
        });
    }
})

app.listen(port, () => {
    console.log(`app started at port ${port}`)
})




const TOOLS = {
    DOCUMENTNAVIGATION: (type) => {
        return {
            "type": "function",
            "name": "document_navigation_response",
            "description":
                "Respond to user's document navigation or question command.",
            "parameters": {
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string", "enum": type == "advanced voice" ? [
                            "basic_navigation",
                            "topic_navigation",
                            "basic_response",
                            "topic_summary",
                            "topic_exploration",
                            "annotations_exploration",
                            "content_narration",
                            "intent_unclear",
                        ] : [
                            "basic_navigation",
                            "basic_response",
                            "content_narration",
                            "intent_unclear",
                        ]
                    },
                    "direction": {
                        "type": ["string", "null"],
                        "enum": ["forward", "backward", null],
                    },
                    "page_count": {
                        "type": ["integer", "null"],
                    },
                    "target_page": {
                        "type": ["integer", "null"],
                    },
                    "section": {
                        "type": ["string", "null"],
                    },
                    "query_type": {
                        "type": ["string", "null"],
                        "enum": [
                            "factual",
                            "definition",
                            "list",
                            "explanation",
                            "summary",
                            "interpretation",
                            "detail",
                            "search_results",
                            "comparison",
                            "synthesis",
                            "analysis",
                            "highlights",
                            "notes",
                            "bookmarks",
                            "all_annotations",
                            null,
                        ],
                    },
                    "read_aloud": {
                        "type": ["string", "null"],
                        "enum": ["full_page", null],
                    },
                    "speech": { "type": "string" },
                    "confidence": { "type": "number" },
                },
                "required": [
                    "intent",
                    "direction",
                    "page_count",
                    "target_page",
                    "section",
                    "query_type",
                    "read_aloud",
                    "speech",
                    "confidence",
                ],
                "additionalProperties": false,
            },
            "strict": true,
        }
    },
    GETNOTESANDHIGHLIGHTS: {
        "type": "function",
        "name": "getUserNotesAndHighlights",
        "description":
            "Retrieve all user-created notes and highlighted text segments for the current PDF document. Optionally filter them by keyword or by page number. Useful when the user refers to something they've highlighted, annotated, or written notes about.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description":
                        "Keyword or phrase to filter notes and highlights related to this text",
                },
                "pageNumber": {
                    "type": ["integer", "null"],
                    "description":
                        "Page number to filter notes and highlights by a specific page.",
                },
            },
            "required": ["query", "pageNumber"],
            "additionalProperties": false,
        },
        "strict": true,
    },
    GETPAGECONTENT: {
        "type": "function",
        "name": "getPageContent",
        "description":
            "Fetch the full text content of specific pages in the current PDF.",
        "strict": true,
        "parameters": {
            "type": "object",
            "properties": {
                "pageNumbers": {
                    "type": "array",
                    "description":
                        "Array of page numbers from the PDF whose text content should be retrieved. Required.",
                    "items": { "type": "integer" },
                },
            },
            "required": ["pageNumbers"],
            "additionalProperties": false,
        },
    },
    GETTOPICNAVIGATION: {
        "type": "function",
        "name": "getTopicNavigationInfo",
        "description":
            "Find where a given topic, word, or phrase is discussed in the PDF. Returns the most relevant page number and chapter (if available).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description":
                        "Topic, keyword, or phrase to locate within the PDF. Required.",
                },
            },
            "required": ["query"],
            "additionalProperties": false,
        },
        "strict": true,
    },
    SEARCHPDFCONTENT: {
        "type": "function",
        "name": "searchPdfContent",
        "description":
            "Perform a full-text search in the PDF and return matching snippets with page numbers.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description":
                        "Text to search for inside the PDF pages. Required.",
                },
                "maxResults": {
                    "type": ["integer", "null"],
                    "description": "Maximum number of search results to return",
                },
            },
            "required": ["query", "maxResults"],
            "additionalProperties": false,
        },
        "strict": true,
    }


}

const SYSTEM_PROMPTS = {
    VOICE: "You are a concise voice assistant. Use short sentences for TTS...",
    ADVANCED_VOICE: "You are an advanced voice assistant with tool access. You can...",
    CHAT: (userinstruction, depth) => `You are ${userinstruction} PDF assistant. Help the user ${depth} navigate...`,
    ADVANCED_CHAT: (userinstruction, depth) => `advanced chat ${userinstruction} PDF assistant. Help the user ${depth} navigate...`,
    CLARIFICATION: "The user's request was ambiguous. Ask for specific details about..."
};
