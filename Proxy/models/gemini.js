const TOOLS = require("./../constants/tools");
const SYSTEM_PROMPTS = require("./../constants/prompts");
const MODELS = require("./../constants/models")

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
        "advanced chat": [TOOLS.GETNOTESANDHIGHLIGHTS, TOOLS.GETPAGECONTENT, TOOLS.SEARCHPDFCONTENT],
    }
    const systemPrompt = promptMap[req.body.systemtype] || req.body.instructions;
    const currentTools = tools[req.body.systemtype] || req.body.tools;
    const userInput = req.body.input
    console.log("gemini is requested")

    var generationmode = req.body.systemtype == "chat" || req.body.systemtype == "advanced chat" ? "streamGenerateContent" : "generateContent"
    console.log(generationmode)
    const url = `https://aiplatform.googleapis.com/v1/publishers/google/models/${MODELS.GEMINI}:${generationmode}?key=AQ.Ab8RN6K-`;

    const geminiBody = {
        contents: [{ role: "user", parts: [{ text: userInput }] }],
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

    const data = await geminiRes.json();
    const json = {
        "toolreturn": data.candidates[0].content,
        "tools":[{ "name": data.candidates[0].content.parts[0].functionCall.name , "args":data.candidates[0].content.parts[0].functionCall.args} ]
    }
    if (geminiRes.ok) {
        res.status(200).json(json);
    } else {
        res.status(geminiRes.status).json(json);
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

    // Drop 'strict' and 'additionalProperties' — not supported in Vertex
    // Only keep required fields that Vertex accepts
    if (parameters.required) {
        converted.required = parameters.required.filter(field =>
            parameters.properties?.[field] !== undefined
        );
    }

    return converted;
}
module.exports = { callgemini };