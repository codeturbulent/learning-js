const MODELS = {
    OPENAI: "gpt-4o-mini",
    CLAUDE: "claude-3-5-sonnet-20240620",
    GEMINI: "gemini-2.5-flash",
};

const APIKEYS = {
    OPENAI: process.env.OPENAI_API_KEY,
    GEMINI: process.env.GEMINI_API_KEY,
    SERPER: process.env.SERPER_API_KEY
};

// Export both as an object
module.exports = {
    MODELS,
    APIKEYS
};