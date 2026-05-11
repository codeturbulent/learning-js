const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const { MODELS, APIKEYS } = require("./../constants/models")
const otel = require("@opentelemetry/api");
const { SpanStatusCode } = require("@opentelemetry/api");
const { clssify } = require("../function/ml.js")
const { Readable } = require("stream");
async function convertToGemini(openAIMessages, userquery = "") {
    const contents = [];
    if (userquery != "") {
        const cl = await clssify(userquery);
        userq = {
            "role": "user",
            "parts": [{ "text": `User Query : "${userquery}" \n ,  intent : ${cl.intent} \n ,  confidence : ${cl.conf}` }]
        };
        contents.push(userq);
    }

    let i = 0;
    while (i < openAIMessages.length) {
        const msg = openAIMessages[i];

        // ✅ Group ALL consecutive toolresponse messages into ONE content entry
        if (msg.type === "toolresponse") {
            const toolParts = [];

            while (i < openAIMessages.length && openAIMessages[i].type === "toolresponse") {
                const t = openAIMessages[i];
                const sanitizedOutput = typeof t.output === "string"
                    ? t.output
                    : JSON.stringify(t.output);

                toolParts.push({
                    "functionResponse": {
                        "name": t.name,
                        "response": {
                            "name": t.name,        // ✅ required by Gemini
                            "content": sanitizedOutput
                        }
                    }
                });
                i++;
            }

            contents.push({
                "role": "user",
                "parts": toolParts   // ✅ all tool responses in ONE entry
            });
            continue; // i already advanced inside the while loop
        }

        if (msg.role === "user") {
            if (typeof msg.content === "string") {
                contents.push({
                    "role": "user",
                    "parts": [{ "text": msg.content }]
                });
            } else if (Array.isArray(msg.content)) {
                const parts = [];
                msg.content.forEach((e) => {
                    if (e.type === "input_text" || e.type === "text") {
                        parts.push({ text: e.text });
                    }
                    if (e.type === "input_image" || e.type === "image_url") {
                        const url = e.image_url?.url || e.image_url || e.data;
                        if (typeof url === "string" && url.startsWith("data:")) {
                            const [meta, data] = url.split(",");
                            const mimeType = meta.split(":")[1].split(";")[0];
                            parts.push({ inlineData: { mimeType, data } });
                        }
                    }
                });
                contents.push({ "role": "user", "parts": parts });
            }
        } else if (msg.role === "model" || msg.role === "assistant") {
            contents.push({
                "role": "model",
                "parts": Array.isArray(msg.parts)
                    ? msg.parts
                    : [{ "text": typeof msg.content === "string" ? msg.content : "" }]
            });
        }

        i++;
    }

    return contents;
}
async function callgemini(req, res) {
    const tracer = otel.trace.getTracer("jiva-proxy");
    const span = otel.trace.getActiveSpan();

    if (span) {
        span.updateName(`Gemini - ${req.body.systemtype || 'Request'}`);
    }

    const promptMap = {
        "voice": SYSTEM_PROMPTS.VOICE,
        "advanced voice": SYSTEM_PROMPTS.ADVANCED_VOICE,
        "chat": SYSTEM_PROMPTS.CHAT(req.body.userinstruction, req.body.depth),
        "advanced chat": SYSTEM_PROMPTS.ADVANCED_CHAT(req.body.userinstruction, req.body.depth),
        "clarification": SYSTEM_PROMPTS.CLARIFICATION,
        "summary": SYSTEM_PROMPTS.SUMMARY,
        "findwithjiva": SYSTEM_PROMPTS.FINDWITHJIVA
    };

    if (req.body.systemtype && !(req.body.systemtype in promptMap)) {
        return res.status(400).json({
            error: "Bad Request",
            message: `Invalid systemtype: ${req.body.systemtype}`
        });
    }

    const tools = {
        "voice": [TOOLS.NAVIGATION, TOOLS.RESPONSE],
        "advanced voice": [TOOLS.NAVIGATION, TOOLS.RESPONSE, TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
        "chat": null,
        "advanced chat": [TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
        "clarification": [TOOLS.CLARIFICATION],
        "findwithjiva": [TOOLS.FINDWITHJIVA]
    }
    const systemPrompt = promptMap[req.body.systemtype];
    const currentTools = tools[req.body.systemtype] ?? [];
    const userInput = Array.isArray(req.body.input) ? req.body.input : [{ role: 'user', content: req.body.input }];
    var userq 
    const message = await convertToGemini(userInput, req.body.userquery);

    var generationmode = "generateContent"

    const url = `https://asia-south1-aiplatform.googleapis.com/v1/publishers/google/models/${MODELS.GEMINI}:${generationmode}?key=${APIKEYS.GEMINI}`;
    const body = {
        contents: message,
        generationConfig: { temperature: req.body.depth == "Focused" ? 0.25 : req.body.depth == "Explorative" ? 0.6 : 0.7 },
        toolConfig: {
            functionCallingConfig: {
                mode: req.body.systemtype === "findwithjiva" ? "ANY" : "AUTO"
            }
        }
    };
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
    const vertexTools = convertToVertexTools(currentTools);
    if (vertexTools) {
        body.tools = vertexTools;
    }

    if (span) {
        // --- CORE SEMANTIC ATTRIBUTES ---
        span.setAttributes({
            "openinference.span.kind": "LLM",
            "llm.model_name": MODELS.GEMINI,
            "llm.provider": "google",
            "llm.system": "vertexai",
            "input.value": JSON.stringify(body),
            "input.mime_type": "application/json",
            "llm.invocation_parameters": JSON.stringify(body.generationConfig || {}),
            "session.id": req.body.sessionId || "unknown",
            "user.id": req.body.userId || "anonymous",
            "metadata": JSON.stringify({ depth: req.body.depth }),
            "tag.tags": ["gemini", req.body.systemtype || "default"]
        });

        // --- 2. TOOL DEFINITIONS ---
        if (currentTools && Array.isArray(currentTools)) {
            currentTools.forEach((tool, i) => {
                const schema = {
                    type: "function",
                    function: {
                        name: tool.function?.name || tool.name,
                        description: tool.function?.description || tool.description || "",
                        parameters: tool.function?.parameters || tool.parameters || {}
                    }
                };
                span.setAttribute(`llm.tools.${i}.tool.json_schema`, JSON.stringify(schema));
            });
        }

        // --- 3. FLATTENED INPUT MESSAGES ---
        let msgIdx = 0;
        if (systemPrompt && systemPrompt.trim()) {
            span.setAttribute(`llm.input_messages.${msgIdx}.message.role`, "system");
            span.setAttribute(`llm.input_messages.${msgIdx}.message.content`, systemPrompt);
            msgIdx++;
        }

        // Log classification message if present
        if (req.body.userquery && req.body.userquery !== "") {
            span.setAttribute(`llm.input_messages.${msgIdx}.message.role`, "user");
            span.setAttribute(`llm.input_messages.${msgIdx}.message.content`, message[0].parts[0].text);
            msgIdx++;
        }

        // Trace original userInput
        userInput.forEach((msg) => {
            if (msg.role === "system") return; // skip ignored system messages
            let role = msg.type === "toolresponse" ? "tool" : (msg.role === "model" ? "assistant" : (msg.role || "user"));
            let content = "";
            let hasContent = false;
            let hasToolCalls = false;

            if (msg.type === "toolresponse") {
                content = typeof msg.output === "string" ? msg.output : JSON.stringify(msg.output);
                hasContent = content !== undefined && content !== null;
                span.setAttribute(`llm.input_messages.${msgIdx}.message.tool_call_id`, msg.callId || msg.tool_call_id || `call_${msg.name}`);
                span.setAttribute(`llm.input_messages.${msgIdx}.message.name`, msg.name);
            } else if (typeof msg.content === "string") {
                content = msg.content;
                hasContent = !!content.trim();
            } else if (Array.isArray(msg.content)) {
                msg.content.forEach((part, partIdx) => {
                    const partPrefix = `llm.input_messages.${msgIdx}.message.contents.${partIdx}.message_content`;
                    if (part.type === "text" || part.type === "input_text") {
                        if (part.text && part.text.trim()) {
                            span.setAttribute(`${partPrefix}.type`, "text");
                            span.setAttribute(`${partPrefix}.text`, part.text);
                            hasContent = true;
                        }
                    } else if (part.type === "image_url" || part.type === "input_image") {
                        const url = part.image_url?.url || part.image_url || part.data;
                        if (url) {
                            span.setAttribute(`${partPrefix}.type`, "image");
                            span.setAttribute(`${partPrefix}.image.image.url`, url);
                            hasContent = true;
                        }
                    }
                });
                content = msg.content.filter(p => p.text || p.input_text).map(p => p.text || p.input_text).join("\n");
            }

            // Handle previous tool calls in history
            if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach((tc, tcIdx) => {
                    const tcPrefix = `llm.input_messages.${msgIdx}.message.tool_calls.${tcIdx}.tool_call`;
                    span.setAttribute(`${tcPrefix}.id`, tc.id || tc.tool_call_id || `call_${tc.function?.name || tc.name}_${msgIdx}_${tcIdx}`);
                    span.setAttribute(`${tcPrefix}.function.name`, tc.function?.name || tc.name);
                    span.setAttribute(`${tcPrefix}.function.arguments`, typeof (tc.function?.arguments || tc.args) === "string" ? (tc.function?.arguments || tc.args) : JSON.stringify(tc.function?.arguments || tc.args || {}));
                });
                hasToolCalls = true;
            }

            if (hasContent || hasToolCalls) {
                span.setAttribute(`llm.input_messages.${msgIdx}.message.role`, role);
                if (hasContent) {
                    span.setAttribute(`llm.input_messages.${msgIdx}.message.content`, content);
                }
                msgIdx++;
            }
        });
    }

    try {
        const geminiRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (generationmode === "streamGenerateContent") {
            if (span) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute("output.mime_type", "text/event-stream");
            }
            res.setHeader("Content-Type", "text/event-stream");

            if (!geminiRes.body) {
                throw new Error("Streaming response has no body");
            }

            const webStream = geminiRes.body;

            const interceptedStream = Readable.from((async function* () {
                const reader = webStream.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let fullText = "";
                let accumulatedToolCalls = [];

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
                                                    fullText += part.text;
                                                    yield `data: ${JSON.stringify({ text: part.text })}\n\n`;
                                                } else if (part.functionCall) {
                                                    accumulatedToolCalls.push({
                                                        name: part.functionCall.name,
                                                        args: part.functionCall.args
                                                    });
                                                    yield `data: ${JSON.stringify({
                                                        tool_calls: [{
                                                            name: part.functionCall.name,
                                                            args: part.functionCall.args
                                                        }]
                                                    })}\n\n`;
                                                }
                                            }
                                        } catch (e) { }
                                        buffer = buffer.slice(i + 1);
                                        i = -1;
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Gemini stream reading error:", err);
                    if (span) span.recordException(err);
                } finally {
                    if (span) {
                        span.setAttribute("llm.output_messages.0.message.role", "assistant");
                        if (fullText.trim()) {
                            span.setAttribute("llm.output_messages.0.message.content", fullText);
                            span.setAttribute("llm.output_text", fullText);
                        }
                        accumulatedToolCalls.forEach((tc, tcIdx) => {
                            const tcPrefix = `llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call`;
                            span.setAttribute(`${tcPrefix}.id`, `call_${tc.name}_${Date.now()}_${tcIdx}`);
                            span.setAttribute(`${tcPrefix}.function.name`, tc.name);
                            span.setAttribute(`${tcPrefix}.function.arguments`, JSON.stringify(tc.args));
                        });
                        span.setAttribute("output.value", fullText || JSON.stringify({ tool_calls: accumulatedToolCalls }));
                    }
                    yield "data: [DONE]\n\n";
                    reader.releaseLock();
                }
            })());

            interceptedStream.pipe(res);
        } else {
            const data = await geminiRes.json();

            if (span) {
                const candidate = data.candidates?.[0];
                if (candidate?.content?.parts) {
                    const textContent = candidate.content.parts
                        .filter(p => p.text)
                        .map(p => p.text)
                        .join("\n");

                    const toolCalls = candidate.content.parts
                        .filter(p => p.functionCall)
                        .map(p => ({
                            name: p.functionCall.name,
                            args: JSON.stringify(p.functionCall.args)
                        }));

                    // --- FLATTENED OUTPUT MESSAGE ---
                    span.setAttribute("llm.output_messages.0.message.role", "assistant");
                    if (textContent.trim()) {
                        span.setAttribute("llm.output_messages.0.message.content", textContent);
                        span.setAttribute("llm.output_text", textContent);
                    }

                    // --- FLATTENED TOOL CALLS ---
                    toolCalls.forEach((tc, tcIdx) => {
                        const callId = `call_${tc.name}_${Date.now()}_${tcIdx}`;
                        span.setAttribute(`llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call.id`, callId);
                        span.setAttribute(`llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call.function.name`, tc.name);
                        span.setAttribute(`llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call.function.arguments`, tc.args);
                    });
                }

                // Standard OpenInference output keys
                span.setAttribute("output.value", JSON.stringify(data));
                span.setAttribute("output.mime_type", "application/json");
                span.setAttribute("metadata.raw_response", JSON.stringify(data));

                if (geminiRes.ok) {
                    span.setStatus({ code: SpanStatusCode.OK });
                } else {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        description: data.error?.message || "Gemini API Error"
                    });
                }

                // Tokens
                if (data.usageMetadata) {
                    span.setAttribute("llm.token_count.total", data.usageMetadata.totalTokenCount);
                    span.setAttribute("llm.token_count.prompt", data.usageMetadata.promptTokenCount);
                    span.setAttribute("llm.token_count.completion", data.usageMetadata.candidatesTokenCount);
                }
            }

            if (!geminiRes.ok) {
                return res.status(geminiRes.status).json({
                    error: "Gemini Proxy Error",
                    message: data.error?.message || "Unknown error",
                    raw: data
                });
            }

            const candidateObj = data.candidates?.[0];
            if (!candidateObj) {
                return res.status(500).json({ error: "No candidates returned from Gemini", raw: data });
            }

            const content = candidateObj.content;

            const json = {
                "content": content,
                "tools": (content.parts || [])
                    .filter(p => p.functionCall)
                    .map(p => ({ "name": p.functionCall.name, "args": p.functionCall.args }))
            }
         if (userq != "" && userq != null) {
    json.userquery = userq;
}
            res.status(200).json(json);
        }
    } catch (error) {
        if (span) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, description: error.message });
        }
        throw error;
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