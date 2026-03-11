const SYSTEM_PROMPTS = {
    VOICE: "You are a concise voice assistant. Use short sentences for TTS...",
    ADVANCED_VOICE: "You are an advanced voice assistant with tool access. You can...",
    CHAT: (userinstruction, depth) => `You are ${userinstruction} PDF assistant. Help the user ${depth} navigate...`,
    ADVANCED_CHAT: (userinstruction, depth) => `advanced chat ${userinstruction} PDF assistant. Help the user ${depth} navigate...`,
    CLARIFICATION: "The user's request was ambiguous. Ask for specific details about..."
};

module.exports = SYSTEM_PROMPTS;
