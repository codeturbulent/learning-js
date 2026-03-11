const express = require("express");
const cors = require('cors');
const { Readable } = require("stream");
const TOOLS = require("./tools");
const SYSTEM_PROMPTS = require("./prompts");

const app = express();
app.use(cors());
const port = 5050;
app.use(express.json());

app.get('/', async (req, res) => {
    res.send("The service is working");
});

const model = {
    "openai": "gpt-4o-mini",
    "claude": "claude-3-5-sonnet-20240620",
    "gemini": "gemini-2.5-flash",
};

function cleanSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) {
        return schema.filter(item => item !== null).map(cleanSchema);
    }
    const newSchema = {};
    for (const key in schema) {
        if (key === 'additionalProperties' || key === 'strict') continue;
        let value = schema[key];
        if (key === 'type' && Array.isArray(value)) {
            value = value.find(t => t !== 'null') || value[0];
        }
        if (key === 'enum' && Array.isArray(value)) {
            value = value.filter(v => v !== null);
        }
        if (typeof value === 'object' && value !== null) {
            newSchema[key] = cleanSchema(value);
        } else {
            newSchema[key] = value;
        }
    }
    return newSchema;
}

function convertToVertexTools(openaiTools) {
    if (!openaiTools || !Array.isArray(openaiTools) || openaiTools.length === 0) return undefined;
    return [{
        functionDeclarations: openaiTools.map(t => {
            const fn = t.function || t;
            return {
                name: fn.name,
                description: fn.description || "",
                parameters: cleanSchema(fn.parameters)
            };
        })
    }];
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
        const systemPrompt = promptMap[req.body.systemtype]
        const currentTools = tools[req.body.systemtype]
        if (req.body.modeltype == "openai") {
            console.log("openai is requested")
            openairesp = await fetch("https://api.openai.com/v1/responses", {
                method: "POST",
                headers: {
                    // "Authorization": `Bearer ${secrets.openaiApiKey}`,
                    "Authorization": `Bearer 174034sk-proj-LNr9WvHjdcTmPGDoL_vabbMhB9bJMfReEpLNJs3TjxYnL1BiPUME2PUGmCmnw7cELEOIErLIsST3BlbkFJrsz6JdbGC29ctM-af1fhJrjeJjAM8FKiQtRb39ZGqUNkApYP2f7U9uDnSkUYzb3zsY7p4ApWsA`,

                    "Content-Type": "application/json",
                    "Accept": req.headers.accept || "application/json",
                },
                body: JSON.stringify({
                    "model": model.openai,
                    "instructions": systemPrompt,
                    "input": req.body.userquery,
                    "tools": currentTools,
                    "parallel_tool_calls": false,
                    "max_tool_calls": 3,
                    "temperature": 0.7,
                    "max_output_tokens": 2048,
                    "tool_choice": "required",
                }),
            })
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
            if (openaiRes.ok) {
                res.status(200).json(json);
            } else {
                res.status(openaiRes.status).json(json);
            }
        } else if (req.body.modeltype == "claude") {
            res.status(401).json({
                error: "Claude is not yet supported",

            });

        } else if (req.body.modeltype == "gemini") {
            console.log("gemini is requested")

            var generationmode = req.body.systemtype == "chat" || req.body.systemtype == "advanced chat" ? "streamGenerateContent" : "generateContent"
            console.log(generationmode)
            const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${model.gemini}:${generationmode}?key=AQ.Ab8RN6JSuGiEiSjZaxZyu5Db1bG0AR9ICAUulOfJpBgwqZkiHw`;

            const geminiBody = {
                contents: [{ role: "user", parts: [{ text: req.body.userquery }] }],
                generationConfig: { maxOutputTokens: 4096, temperature: 0.7 }
            };
            geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
            const vertexTools = convertToVertexTools(currentTools);
            geminiBody.tools = vertexTools;
            const geminiRes = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(geminiBody)
            });

            const json = await geminiRes.json();
            if (geminiRes.ok) {
                res.status(200).json(json);
            } else {
                res.status(geminiRes.status).json(json);
            }
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

