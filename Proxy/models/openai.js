const { Readable } = require("stream");
const otel = require("@opentelemetry/api");
const { SpanStatusCode } = require("@opentelemetry/api");

const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const { MODELS, APIKEYS } = require("../constants/constants")


async function callopenai(req, res) {
    const tracer = otel.trace.getTracer("jiva-proxy");
    const span = otel.trace.getActiveSpan();

    if (span) {
        span.updateName(`OpenAI - ${req.body.systemtype || 'Request'}`);
    }

    const promptMap = {
        "voice": SYSTEM_PROMPTS.VOICE,
        "advanced voice": SYSTEM_PROMPTS.ADVANCED_VOICE,
        "chat": SYSTEM_PROMPTS.CHAT(req.body.userinstruction, req.body.depth),
        "advanced chat": SYSTEM_PROMPTS.ADVANCED_CHAT(req.body.userinstruction, req.body.depth),
        "clarification": SYSTEM_PROMPTS.CLARIFICATION
    };
    const tools = {
        "voice": [TOOLS.NAVIGATION, TOOLS.RESPONSE],
        "advanced voice": [TOOLS.NAVIGATION, TOOLS.RESPONSE, TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.GETTOPICNAVIGATION, TOOLS.SEARCHPDFCONTENT],
        "chat": null,
        "advanced chat": [TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
    }
    const systemPrompt = promptMap[req.body.systemtype] || req.body.instructions;
    const currentTools = tools[req.body.systemtype] || req.body.tools;
    const userInput = req.body.input
    var generationmode = req.body.systemtype == "chat" || req.body.systemtype == "advanced chat"

    const reqBody = {
        "model": MODELS.OPENAI,
        "instructions": systemPrompt,
        "input": userInput,
        "tools": currentTools,
        "parallel_tool_calls": false,
        "max_tool_calls": 3,
        'stream': generationmode,
        "temperature": req.body.depth == "Focused" ? 0.25 : req.body.depth == "Explorative" ? 0.6 : 0.7,
        "max_output_tokens": req.body.depth == "Focused" ? 512. : req.body.depth == "Explorative" ? 1024 : 2048,
        "tool_choice": req.body.tool_choice || "auto",
    }

    if (span) {
        // --- CORE SEMANTIC ATTRIBUTES ---
        span.setAttributes({
            "openinference.span.kind": "LLM",
            "llm.model_name": MODELS.OPENAI,
            "llm.provider": "openai",
            "llm.system": "openai",
            "input.value": JSON.stringify(reqBody),
            "input.mime_type": "application/json",
            "llm.invocation_parameters": JSON.stringify({
                temperature: reqBody.temperature,
                max_tokens: reqBody.max_output_tokens,
                tool_choice: reqBody.tool_choice
            }),
            "session.id": req.body.sessionId || "unknown",
            "user.id": req.body.userId || "anonymous",
            "metadata": JSON.stringify({ depth: req.body.depth }),
            "tag.tags": ["openai", req.body.systemtype || "default"]
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
        if (Array.isArray(userInput)) {
            userInput.forEach((msg) => {
                let role = msg.role || "user";
                if (msg.type === "toolresponse") role = "tool";
                if (role === "model") role = "assistant";
                
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
                } else if (msg.content) {
                    content = JSON.stringify(msg.content);
                    hasContent = !!content;
                }

                // Handle tool calls in history
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
    }

    console.log("openai is requested")

    try {
        const openaiRes = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${APIKEYS.OPENAI}`,
                "Content-Type": "application/json",
                "Accept": req.headers.accept || "application/json",
            },
            body: JSON.stringify(reqBody),
        })

        const contentType = openaiRes.headers.get("content-type") || "";
        if (contentType.includes("text/event-stream")) {
            if (span) {
                span.setStatus({ code: SpanStatusCode.OK });
                span.setAttribute("output.mime_type", "text/event-stream");
            }
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            if (!openaiRes.body) throw new Error("Streaming response has no body");

            const webStream = openaiRes.body;

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

                                    // Get content delta
                                    const delta = parsed.delta || parsed.output?.[0]?.delta || parsed.choices?.[0]?.delta?.content;

                                    if (delta && typeof delta === 'string') {
                                        fullText += delta;
                                        yield `data: ${JSON.stringify({ text: delta })}\n\n`;
                                    }

                                    // Handle tool calls in stream
                                    const toolCallDelta = parsed.choices?.[0]?.delta?.tool_calls?.[0] || parsed.output?.[0]?.delta?.tool_calls?.[0];
                                    if (toolCallDelta && toolCallDelta.function) {
                                        accumulatedToolCalls.push({
                                            name: toolCallDelta.function.name,
                                            args: toolCallDelta.function.arguments
                                            // args are usually strings in OpenAI stream deltas
                                        });
                                        yield `data: ${JSON.stringify({
                                            tool_calls: [{
                                                name: toolCallDelta.function.name,
                                                args: toolCallDelta.function.arguments
                                            }]
                                        })}\n\n`;
                                    }
                                } catch (e) { }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Stream reading error:", err);
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
                            span.setAttribute(`${tcPrefix}.function.arguments`, typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args));
                        });
                        span.setAttribute("output.value", fullText || JSON.stringify({ tool_calls: accumulatedToolCalls }));
                    }
                    yield "data: [DONE]\n\n";
                    reader.releaseLock();
                }
            })());

            interceptedStream.pipe(res);
        } else {
            const data = await openaiRes.json();

            if (span) {
                // RESTORE: Populate the "Output" table column
                span.setAttribute("output.value", JSON.stringify(data));
                span.setAttribute("output.mime_type", "application/json");

                span.setAttribute("metadata.raw_response", JSON.stringify(data));

                // TOKEN BLOCKS
                if (data.usage) {
                    span.setAttribute("llm.token_count.total", data.usage.total_tokens);
                    span.setAttribute("llm.token_count.prompt", data.usage.prompt_tokens);
                    span.setAttribute("llm.token_count.completion", data.usage.completion_tokens);
                }

                // --- FLATTENED OUTPUT MESSAGE ---
                const output = data.output?.[0] || data.choices?.[0]?.message;
                if (output) {
                    let textContent = "";
                    if (output.content) {
                        textContent = typeof output.content === "string" ? output.content :
                            (Array.isArray(output.content) ? output.content.find(c => c.type === "output_text")?.text : "");
                    }

                    span.setAttribute("llm.output_messages.0.message.role", "assistant");
                    if (textContent && textContent.trim()) {
                        span.setAttribute("llm.output_messages.0.message.content", textContent);
                        span.setAttribute("llm.output_text", textContent);
                    }

                    // --- FLATTENED TOOL CALLS ---
                    let toolCalls = [];
                    if (output.arguments) {
                        toolCalls = [{ name: output.name, arguments: output.arguments }];
                    } else if (output.tool_calls) {
                        toolCalls = output.tool_calls.map(tc => ({
                            name: tc.function.name,
                            arguments: tc.function.arguments
                        }));
                    }

                    toolCalls.forEach((tc, tcIdx) => {
                        const callId = `call_${tc.name}_${Date.now()}_${tcIdx}`;
                        span.setAttribute(`llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call.id`, callId);
                        span.setAttribute(`llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call.function.name`, tc.name);
                        span.setAttribute(`llm.output_messages.0.message.tool_calls.${tcIdx}.tool_call.function.arguments`, tc.arguments);
                    });
                }

                if (openaiRes.ok) {
                    span.setStatus({ code: SpanStatusCode.OK });
                } else {
                    span.setStatus({
                        code: SpanStatusCode.ERROR,
                        description: data.error?.message || data.message || "OpenAI API Error"
                    });
                }
            }

            if (!openaiRes.ok) {
                return res.status(openaiRes.status).json({
                    error: "OpenAI Proxy Error",
                    message: data.error?.message || data.message || "Unknown error",
                    raw: data
                });
            }

            const outputObj = data.output?.[0] || data.choices?.[0]?.message;
            let text = "";
            if (outputObj && outputObj.content) {
                if (typeof outputObj.content === "string") {
                    text = outputObj.content;
                } else if (Array.isArray(outputObj.content)) {
                    text = outputObj.content.find(c => c.type === "output_text")?.text || "";
                }
            }

            // Standardize tool extraction for response
            let tools = [];
            if (outputObj && outputObj.arguments) {
                tools = [{ "name": outputObj.name, "args": JSON.parse(outputObj.arguments) }];
            } else if (outputObj && outputObj.tool_calls) {
                tools = outputObj.tool_calls.map(tc => ({
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments)
                }));
            }

            const json = {
                "text": text,
                "toolreturn": outputObj,
                "tools": tools
            };
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

module.exports = { callopenai };