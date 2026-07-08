const { json, response } = require("express");
const { APIKEYS } = require("../constants/constants");

async function texttovoice(text, lang) {
    try {
        const _text = text ?? "I cant quite find the right words.";
        const _lang = lang ?? "en-IN"

        const resp = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: "POST",
            headers: {
                'api-subscription-key': APIKEYS.SARVAM,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "text": _text,
                "target_language_code": lang,
                "model": "bulbul:v3",
                "speaker": "shreya",
                "temperature": 0.65,
                "pace": 1.0,
                "speech_sample_rate" :16000,
                "output_audio_bitrate":"96k",
            }),
        });

        if (!resp.ok) {
            throw new Error(`Error : ${resp.status}`);
        }

        const data = await resp.json();
        if (data.audios && data.audios.length > 0) {
            const base64Audio = data.audios[0];
            return base64Audio;
        } else {
            console.log("No audio data");
        }
    } catch (error) {
        console.error("Error fetching text-to-speech:", error);
    }
}
module.exports = { texttovoice };