const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const MODELS = require("./../constants/models")
const APIKEYS = require('./../constants/models')
const { Readable } = require("stream");


async function callgemini(req, res) {
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
        "advanced chat": [ TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
    }
    const systemPrompt = promptMap[req.body.systemtype] || req.body.instructions;
    const currentTools = tools[req.body.systemtype] || req.body.tools;
    const userInput = req.body.input
    console.log("gemini is requested")
    var generationmode = req.body.systemtype == "chat" || req.body.systemtype == "advanced chat" ? "streamGenerateContent" : "generateContent"
    
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODELS.GEMINI}:${generationmode}?key=${APIKEYS.GEMINI}`;
    const body = {
        contents: [{ role: "user", parts: [{ text: userInput }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.7 }
    };
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
    const vertexTools = convertToVertexTools(currentTools);
    if (vertexTools) {
        body.tools = vertexTools;
    }
    
    const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (generationmode === "streamGenerateContent") {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        if (!geminiRes.body) {
            throw new Error("Streaming response has no body");
        }

        const webStream = geminiRes.body;
        
        const interceptedStream = Readable.from((async function* () {
            const reader = webStream.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    let startIdx = 0;
                    let depth = 0;
                    let inString = false;

                    for (let i = 0; i < buffer.length; i++) {
                        const char = buffer[i];
                        if (char === '"' && buffer[i - 1] !== '\\') {
                            inString = !inString;
                        }
                        if (!inString) {
                            if (char === '{') {
                                if (depth === 0) startIdx = i;
                                depth++;
                            } else if (char === '}') {
                                depth--;
                                if (depth === 0) {
                                    const jsonStr = buffer.slice(startIdx, i + 1);
                                    try {
                                        const parsed = JSON.parse(jsonStr);
                                        const parts = parsed.candidates?.[0]?.content?.parts || [];
                                        
                                        for (const part of parts) {
                                            if (part.text) {
                                                yield `data: ${JSON.stringify({ text: part.text })}\n\n`;
                                            } else if (part.functionCall) {
                                                yield `data: ${JSON.stringify({ 
                                                    tool_calls: [{ 
                                                        name: part.functionCall.name, 
                                                        args: part.functionCall.args 
                                                    }] 
                                                })}\n\n`;
                                            }
                                        }
                                    } catch (e) {}
                                    buffer = buffer.slice(i + 1);
                                    i = -1;
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Gemini stream reading error:", err);
            } finally {
                yield "data: [DONE]\n\n";
                reader.releaseLock();
            }
        })());

        interceptedStream.pipe(res);
    } else {
        const data = await geminiRes.json();

        if (!geminiRes.ok) {
            return res.status(geminiRes.status).json({
                error: "Gemini Proxy Error",
                message: data.error?.message || "Unknown error",
                raw: data
            });
        }

        const candidate = data.candidates?.[0];
        if (!candidate) {
            return res.status(500).json({ error: "No candidates returned from Gemini", raw: data });
        }

        const content = candidate.content;
        const json = {
            "toolreturn": content,
            "tools": content.parts
                .filter(p => p.functionCall)
                .map(p => ({ "name": p.functionCall.name, "args": p.functionCall.args }))
        }
        res.status(200).json(json);
    }
}

function convertToVertexTools(tools) {
    if (!tools || !Array.isArray(tools) || tools.length === 0) return undefined;

    return {
        function_declarations: tools.map(tool => {
            const fn = tool.function || tool;
            const parameters = fn.parameters ? convertParameters(fn.parameters) : undefined;

            return {
                name: fn.name,
                description: fn.description || "",
                ...(parameters && { parameters })
            };
        })
    };
}

function convertParameters(parameters) {
    if (!parameters) return undefined;

    const converted = {
        type: parameters.type,
    };

    if (parameters.description) {
        converted.description = parameters.description;
    }

    if (parameters.enum) {
        converted.enum = parameters.enum;
    }

    if (parameters.properties) {
        converted.properties = Object.fromEntries(
            Object.entries(parameters.properties).map(([key, value]) => [
                key,
                convertParameters(value)
            ])
        );
    }
    if (parameters.required) {
        converted.required = parameters.required.filter(field =>
            parameters.properties?.[field] !== undefined
        );
    }

    return converted;
}
module.exports = { callgemini };