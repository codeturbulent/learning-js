require('./tracing.js');
try { require('dotenv').config(); } catch (e) {}
const express = require("express");
const cors = require('cors');
const { Readable } = require("stream");

const { callgemini } = require("./models/gemini");
const { callopenai } = require("./models/openai");
const { findwithjiva } = require("./function/fwj")
const {texttovoice} = require("./function/tts.js")
const { MODELS, APIKEYS } = require("./constants/constants.js")


const otel = require("@opentelemetry/api");
const { translate } = require('./function/translate.js');
const { text } = require('stream/consumers');

const app = express();
app.use(cors());
const port = process.env.PORT || 5050;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Input validation middleware
const validateRequest = (req, res, next) => {
    if (req.method === 'POST' && req.path !== '/findwithjiva' && req.path !== '/texttotranslatevoice') {
        const { input, model } = req.body;
        if (!input && model !== 'claude') { // Claude is currently a stub
            return res.status(400).json({
                error: "Invalid Request",
                message: "Missing 'input' in request body"
            });
        }
    }
    next();
};
app.use(validateRequest);

app.get('/', async (req, res) => {
    res.send("The service is working");
});

app.post('/findwithjiva' , async (req , res) => {
    return await findwithjiva( req, res);
} )

app.post('/texttotranslatevoice', async (req, res) => {
    const span = otel.trace.getActiveSpan();
    if (span) {
        span.updateName("texttotranslatevoice");
        span.setAttributes({
            "openinference.span.kind": "CHAIN",
            "session.id": req.body.sessionId || "unknown",
            "user.id": req.body.userId || "anonymous",
            "input.value": req.body.text || "",
            "input.mime_type": "text/plain"
        });
    }

    try {
        const textToProcess = req.body.text;
        const lang = req.body.lang;

        if (!textToProcess) {
            if (span) {
                span.setStatus({
                    code: otel.SpanStatusCode.ERROR,
                    description: "Missing 'text' field in request body."
                });
            }
            return res.status(400).json({ error: "Missing 'text' field in request body." });
        }

        let translatedtext = textToProcess;

        // Check if the target language is English (en-IN); if so, skip translation
        if (lang === 'en-IN') {
            if (span) {
                span.setAttributes({
                    "translate.skipped": true,
                    "translate.reason": "Target language is en-IN (English), skipping translation step."
                });
            }
        } else {
            // Trace and execute translate call
            if (span) {
                span.setAttributes({
                    "translate.input": textToProcess,
                    "translate.target_language": lang,
                    "translate.model_name": "mayura:v1",
                    "translate.provider": "sarvam",
                    "translate.skipped": false
                });
            }

            translatedtext = await translate(textToProcess, lang);

            if (span) {
                span.setAttributes({
                    "translate.output": translatedtext
                });
            }
        }

        // Trace tts call
        if (span) {
            span.setAttributes({
                "tts.input": translatedtext,
                "tts.language": lang,
                "tts.model_name": "bulbul:v3",
                "tts.provider": "sarvam"
            });
        }

        const audioData = await texttovoice(translatedtext, lang);

        const json = {
            "audios": [audioData]
        };

        if (span) {
            span.setAttributes({
                "output.value": JSON.stringify({
                    success: !!audioData,
                    audio_length: audioData ? audioData.length : 0
                }),
                "output.mime_type": "application/json",
                "tts.output": `Audio generated successfully. Length: ${audioData ? audioData.length : 0} characters.`
            });
            span.setStatus({ code: otel.SpanStatusCode.OK });
        }

        res.status(200).json(json);
        
    } catch (error) {
        console.error("Error in /texttovoice route:", error);
        if (span) {
            span.recordException(error);
            span.setStatus({
                code: otel.SpanStatusCode.ERROR,
                description: error.message
            });
        }
        res.status(500).json({ error: "Failed to generate text-to-speech audio." });
    }
});

app.post('/response', async (req, res) => {
    const model = req.body.model ?? "gemini"

    try {
        if (model === "openai") {
           return await callopenai(req, res);
        } else if (model === "claude") {
            return res.status(401).json({
                error: "Feature Not Available",
                message: "Claude is not yet supported",
            });
        } else if (model === "gemini") {
            return await callgemini(req, res);
        } else {
            console.log("fallback for the older versions");
            const span = otel.trace.getActiveSpan();
            if (span) {
                span.updateName("fallback_inference");
                span.setAttribute("openinference.span.kind", "LLM");
                span.setAttribute("llm.model_name", "openai-fallback");
                span.setAttribute("input.value", JSON.stringify(req.body));
            }
                
            try {
                const openaiRes = await fetch(
                    "https://api.openai.com/v1/responses",
                    {
                        method: "POST",
                        headers: {
                           "Authorization": `Bearer ${APIKEYS.OPENAI}`,
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
                if (span) {
                    span.setAttribute("output.value", JSON.stringify(json));
                }
                res.status(openaiRes.status).json(json);
            } catch (err) {
                if (span) {
                    span.recordException(err);
                }
                throw err;
            }
        }
    } catch (err) {
        console.error("responsesProxy error:", err);
        res.status(500).json({
            error: "Proxy failure",
            message: err.message || err,
        });
    }
})



app.listen(port, () => {
    console.log(`app started at port ${port}`)
})
