const { Readable } = require("stream");

const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const MODELS = require("./../constants/models");

async function callopenai(req, res) {
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
    const systemPrompt = promptMap[req.body.systemtype] || req.body.instructions;
    const currentTools = tools[req.body.systemtype] || req.body.tools;
    const userInput = req.body.input
    var generationmode = req.body.systemtype == "chat" || req.body.systemtype == "advanced chat"

    console.log("openai is requested")
    const apiKey = "openai api";

    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": req.headers.accept || "application/json",
        },
        body: JSON.stringify({
            "model": MODELS.OPENAI,
            "instructions": systemPrompt,
            "input": userInput,
            "tools": currentTools,
            "parallel_tool_calls": false,
            "max_tool_calls": 3,
            'stream': generationmode,
            "temperature": 0.7,
            "max_output_tokens": 2048,
            "tool_choice": req.body.tool_choice || "auto",
        }),
    })

    const contentType = openaiRes.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        if (!openaiRes.body) throw new Error("Streaming response has no body");

        const webStream = openaiRes.body;

        const interceptedStream = Readable.from((async function* () {
            const reader = webStream.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let textBuffer = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let lines = buffer.split("\n");
                    buffer = lines.pop();

                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine || trimmedLine === "data: [DONE]") continue;

                        if (trimmedLine.startsWith("data: ")) {
                            try {
                                const jsonStr = trimmedLine.replace("data: ", "");
                                const parsed = JSON.parse(jsonStr);

                                const delta = parsed.delta || parsed.output?.[0]?.delta || parsed.choices?.[0]?.delta?.content;
                                
                                if (delta && typeof delta === 'string') {
                                    textBuffer += delta;
                                    // Yield raw text immediately
                                    yield `data: ${JSON.stringify({ text: delta })}\n\n`;
                                }
                            } catch (e) {}
                        }
                    }
                }
                
                // End of stream - check if the accumulated text is actually a JSON tool call
                const trimmedBuffer = textBuffer.trim();
                if (trimmedBuffer.startsWith("{") && trimmedBuffer.endsWith("}")) {
                    try {
                        const toolObj = JSON.parse(trimmedBuffer);
                        if (toolObj.intent || toolObj.target_page) {
                            yield `data: ${JSON.stringify({ 
                                tool_calls: [{ 
                                    name: "document_navigation_response", 
                                    args: toolObj 
                                }] 
                            })}\n\n`;
                        }
                    } catch (e) {}
                }

            } catch (err) {
                console.error("Stream reading error:", err);
            } finally {
                yield "data: [DONE]\n\n";
                reader.releaseLock();
            }
        })());

        interceptedStream.pipe(res);
    } else {
        const data = await openaiRes.json();

        if (!openaiRes.ok) {
            return res.status(openaiRes.status).json({
                error: "OpenAI Proxy Error",
                message: data.error?.message || data.message || "Unknown error",
                raw: data
            });
        }

        const output = data.output?.[0] || data.choices?.[0]?.message;
        if (!output) {
            return res.status(500).json({ error: "Invalid response from OpenAI", raw: data });
        }

        // Standardize tool extraction
        let tools = [];
        if (output.arguments) {
            tools = [{ "name": output.name, "args": JSON.parse(output.arguments) }];
        } else if (output.tool_calls) {
            tools = output.tool_calls.map(tc => ({
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
            }));
        }

        let text = "";
        if (output.content) {
            if (typeof output.content === "string") {
                text = output.content;
            } else if (Array.isArray(output.content)) {
                text = output.content.find(c => c.type === "output_text")?.text || "";
            }
        }

        const json = {
            "text": text,
            "toolreturn": output,
            "tools": tools
        };
        res.status(200).json(json);
    }
}

module.exports = { callopenai };