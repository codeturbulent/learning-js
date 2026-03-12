const express = require("express");
const cors = require('cors');
const { Readable } = require("stream");
const TOOLS = require("./constants/tools");
const SYSTEM_PROMPTS = require("./constants/prompts");
const MODELS= require("./constants/models")
const { callgemini } = require("./models/gemini");
const { callopenai } = require("./models/openai");

const app = express();
app.use(cors());
const port = 5050;
app.use(express.json());

app.get('/', async (req, res) => {
    res.send("The service is working");
});



app.post('/', async (req, res) => {
    try {
        console.log("Incoming Body:", req.body);

        if (req.body.modeltype == "openai") {

        const resp=  await callopenai(req,res)

        } else if (req.body.modeltype == "claude") {

            res.status(401).json({
                error: "Claude is not yet supported",
            });

        } else if (req.body.modeltype == "gemini") {

            return await callgemini(req,res)

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

app.get("/stream", async (req, res) => {
  const text =
    "Hello this is a streaming response where every word is sent one by one using Server-Sent Events in Express";

  const words = text.split(" ");

  // Set headers for SSE (Server-Sent Events)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  res.flushHeaders(); // flush headers immediately so the client knows streaming has started

  for (const word of words) {
    // SSE format: "data: <payload>\n\n"
    res.write(`data: ${word}\n\n`);
    await sleep(100); // 300 ms delay between words — adjust as needed
  }

  // Signal the client that the stream is done
  res.write("data: [DONE]\n\n");
  res.end();
});


app.listen(port, () => {
    console.log(`app started at port ${port}`)
})

