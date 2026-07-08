const { APIKEYS } = require("../constants/constants");

async function translate(text, lang) {
    const url = 'https://api.sarvam.ai/translate';

    // Body payload matching your exact curl parameters
    const payload = {
        input: text,
        source_language_code: "auto",
        target_language_code: lang,
        model: "mayura:v1", numerals_format: "international", mode: "formal",
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'api-subscription-key': APIKEYS.SARVAM
            },
            body: JSON.stringify(payload)
        });

        // Handle non-200 HTTP response codes cleanly
        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(`HTTP Error ${response.status}: ${errorPayload.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.translated_text;

    } catch (error) {
        console.error("Request failed:", error);
        throw error;
    }
}
module.exports = { translate };
