async function clssify(query) {
    try {
        const response = await fetch("http://localhost:8000/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "text": query })
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return {
            intent: data.intent,
            conf: data.confidence
        };
    } catch (error) {
        console.error("Could not fetch intent:", error);
        return { intent: "intent was not classified", conf: 0 };
    }
}

module.exports = { clssify };