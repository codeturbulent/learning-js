const { Readable } = require("stream");


const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const MODELS = require("./../constants/models");
const { json } = require("stream/consumers");


 async function callopenai(req,res) {

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
    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Authorization": `Bearer `,
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
    // // 🔴 STREAMING RESPONSE (SSE)
    if (contentType.includes("text/event-stream")) {
        console.log("streaming resp" ,openaiRes.body)
        res.status(openaiRes.status);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        if (!openaiRes.body) {
            throw new Error("Streaming response has no body");
        }

        const webStream = openaiRes.body;
        console.log(webStream)
        const nodeStream = Readable.fromWeb(webStream);
        nodeStream.pipe(res);
        return;
    }
    // 🔵 NON-STREAMING RESPONSE (JSON)
     const data = await openaiRes.json();
    const json = {
        "toolreturn": data.output[0],
        "tools":[{ "name": data.output[0].name , "args":JSON.parse(data.output[0].arguments)} ]
    }
    if (openaiRes.ok) {
        res.status(200).json(json);
    } else {
        res.status(openaiRes.status).json(json);
    }
}

module.exports = { callopenai };