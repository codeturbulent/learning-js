try { require('dotenv').config(); } catch (e) {}
const express = require("express");
const cors = require('cors');
const { Readable } = require("stream");

const { callgemini } = require("./models/gemini");
const { callopenai } = require("./models/openai");

const app = express();
app.use(cors());
const port = process.env.PORT || 5050;
app.use(express.json());

// Input validation middleware
const validateRequest = (req, res, next) => {
    if (req.method === 'POST') {
        const { input, modeltype } = req.body;
        if (!input && modeltype !== 'claude') { // Claude is currently a stub
            return res.status(400).json({
                error: "Invalid Request",
                message: "Missing 'input' in request body"
            });
        }
    }
    next();
};
const modeltype = "gemini"
app.use(validateRequest);

app.get('/', async (req, res) => {
    res.send("The service is working");
});

app.post('/', async (req, res) => {
    try {


        if (modeltype === "openai") {
            return await callopenai(req, res);
        } else if (modeltype === "claude") {
            return res.status(401).json({
                error: "Feature Not Available",
                message: "Claude is not yet supported",
            });
        } else if (modeltype === "gemini") {
            return await callgemini(req, res);
        } else {
            console.log("fallback for the older versions");
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
            res.status(openaiRes.status).json(json);
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
