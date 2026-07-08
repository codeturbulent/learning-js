const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const { MODELS, APIKEYS } = require("../constants/constants.js")
const otel = require("@opentelemetry/api");
const { SpanStatusCode } = require("@opentelemetry/api");
const { clssify } = require("../function/ml.js")
const { Readable } = require("stream");
const {texttovoice} = require("../function/tts.js")

var userq;
async function convertToGemini(openAIMessages, userquery = "") {
    const contents = [];
    if (userquery != "") {
        const cl = await clssify(userquery);
        const textPayload = {
            "userQuery": userquery,
            "intent": cl.intent,
            "confidence": cl.conf
        };

        userq = {
            "role": "user",
            "parts": [
                {
                    "text": JSON.stringify(textPayload)
                }
            ]
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
        "voice": [TOOLS.NAVIGATION, TOOLS.RESPONSE, TOOLS.READPDFPAGES],
        "advanced voice": [TOOLS.NAVIGATION, TOOLS.RESPONSE, TOOLS.READPDFPAGES, TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
        "chat": [TOOLS.NAVIGATION],
        "advanced chat": [TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT, TOOLS.NAVIGATION],
        "clarification": [TOOLS.CLARIFICATION],
        "findwithjiva": [TOOLS.FINDWITHJIVA]
    }
    const systemPrompt = promptMap[req.body.systemtype];
    const currentTools = tools[req.body.systemtype] ?? [];
    const userInput = Array.isArray(req.body.input) ? req.body.input : [{ role: 'user', content: req.body.input }];

    const message = await convertToGemini(userInput, req.body.userquery);

    var generationmode = "generateContent"

    const url = `https://asia-south1-aiplatform.googleapis.com/v1/publishers/google/models/${MODELS.GEMINI}:${generationmode}?key=${APIKEYS.GEMINI}`;
    const body = {
        contents: message,
        generationConfig: { temperature: req.body.depth == "Focused" ? 0.7 : req.body.depth == "Explorative" ? 1.2 : 0.9, max_output_tokens: 5000 },
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
            if (msg.role === "system") return;

            // Standardize role
            let role = msg.type === "toolresponse" ? "tool" : (msg.role === "model" ? "assistant" : (msg.role || "user"));

            let textContent = "";
            let hasValidContent = false;
            let hasToolCalls = !!(msg.tool_calls && msg.tool_calls.length > 0);

            const baseKey = `llm.input_messages.${msgIdx}.message`;

            // 1. Handle Tool Responses
            if (msg.type === "toolresponse") {
                textContent = typeof msg.output === "string" ? msg.output : JSON.stringify(msg.output);
                span.setAttribute(`${baseKey}.tool_call_id`, msg.callId || msg.tool_call_id || `call_${msg.name}`);
                span.setAttribute(`${baseKey}.name`, msg.name);
                hasValidContent = true;
            }
            // 2. Handle Simple String Content
            else if (typeof msg.content === "string" && msg.content.trim()) {
                textContent = msg.content;
                hasValidContent = true;
            }
            // 3. Handle Array/Multi-part Content
            // 3. Handle Array/Multi-part Content
            else if (Array.isArray(msg.content)) {
                const parts = [];
                msg.content.forEach((part, partIdx) => {
                    const partPrefix = `${baseKey}.contents.${partIdx}.message_content`;

                    if (part.type === "text" || part.type === "input_text") {
                        const text = part.text || part.input_text;
                        if (text?.trim()) {
                            span.setAttribute(`${partPrefix}.type`, "text");
                            span.setAttribute(`${partPrefix}.text`, text);
                            hasValidContent = true;
                        }
                    }
                    else if (part.type === "image_url" || part.type === "input_image") {
                        const url = part.image_url?.url || part.image_url || part.data;
                        if (url) {
                            span.setAttribute(`${partPrefix}.type`, "image");
                            span.setAttribute(`${partPrefix}.image.image.url`, url);
                            hasValidContent = true;
                        }
                    }

                });
                // Now textContent contains both the text and the ![image](url) tags
                textContent = parts.join("\n");
            }

            // 4. Handle Tool Calls (The Assistant calling a tool)
            if (hasToolCalls) {
                msg.tool_calls.forEach((tc, tcIdx) => {
                    const tcPrefix = `${baseKey}.tool_calls.${tcIdx}.tool_call`;
                    const args = tc.function?.arguments || tc.args || {};
                    span.setAttribute(`${tcPrefix}.id`, tc.id || tc.tool_call_id || `call_${msgIdx}_${tcIdx}`);
                    span.setAttribute(`${tcPrefix}.function.name`, tc.function?.name || tc.name);
                    span.setAttribute(`${tcPrefix}.function.arguments`, typeof args === "string" ? args : JSON.stringify(args));
                });
            }

            // Finalize the message in the span
            if (hasValidContent || hasToolCalls) {
                span.setAttribute(`${baseKey}.role`, role);
                if (textContent) {
                    span.setAttribute(`${baseKey}.content`, textContent);
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

            const tools = (content.parts || [])
                .filter(p => p.functionCall)
                .map(p => ({ "name": p.functionCall.name, "args": p.functionCall.args }));

            const speechTools = tools.filter(x => x.name === "synthesizeSpeech");

            const audios = await Promise.all(
                speechTools.map(async (x) => {
                    return await texttovoice(x.args["speech"] , x.args["lang"]);
                })
            );

            const json = {
                "audios": audios, 
                "content": content,
                "tools": tools
            };
            if (userq) json.userquery = userq;
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