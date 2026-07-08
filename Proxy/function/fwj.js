const { APIKEYS } = require("../constants/constants");
const otel = require("@opentelemetry/api");
const { SpanStatusCode } = require("@opentelemetry/api");

async function findwithjiva(req, res) {
    const span = otel.trace.getActiveSpan();
    if (span) {
        // Match the naming convention in your screenshot
        span.updateName("findwithjiva");
    }

    try {
        const inputList = req.body && req.body.input;

        if (!Array.isArray(inputList) || inputList.length === 0 || !inputList[0].content) {
            return res.status(400).json({ error: "Missing search query" });
        }

        const content = inputList[0].content.trim();
        const calibratedContent = content.includes(' ') ? `"${content}"` : content;

        const searchQuery = `filetype:pdf ${calibratedContent}`;

        // --- CORE TRACING ATTRIBUTES (Matching your Gemini logic) ---
        if (span) {
            span.setAttributes({
                "openinference.span.kind": "TOOL", // Set to TOOL since it's a direct search
                "llm.model_name": "google-serper",
                "llm.provider": "serper",
                "input.value": searchQuery,
                "input.mime_type": "text/plain",
                "session.id": req.body.sessionId || "unknown",
                "user.id": req.body.userId || "anonymous",
                "tag.tags": ["serper", "findwithjiva"],
                // Flattened Input Message
                "llm.input_messages.0.message.role": "user",
                "llm.input_messages.0.message.content": searchQuery,
                // Custom attributes seen in your screenshot
                "search.query": searchQuery
            });
        }



        const myHeaders = new Headers();
        myHeaders.append("X-API-KEY", APIKEYS.SERPER);
        myHeaders.append("Content-Type", "application/json");

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: JSON.stringify({ "q": searchQuery }),
            redirect: "follow"
        };

        const serperResponse = await fetch("https://google.serper.dev/search", requestOptions);
        const result = await serperResponse.json();

        if (!serperResponse.ok) {
            throw new Error(`Serper API error: ${serperResponse.status}`);
        }
        if (result.organic && result.organic.length > 0) {
            const reranked = await rerank(content, result.organic);
            result.organic = reranked;
        }
        // --- OUTPUT TRACING (Matching your Gemini logic) ---
        if (span) {
            const resultsCount = result.organic?.length || 0;

            span.setAttributes({
                "output.value": JSON.stringify(result),
                "output.mime_type": "application/json",
                "search.results_count": resultsCount,
                "metadata.raw_response": JSON.stringify(result),
                // Flattened Output Message
                "llm.output_messages.0.message.role": "assistant",
                "llm.output_messages.0.message.content": ` ${resultsCount}`
            });

            span.setStatus({ code: SpanStatusCode.OK });
        }

        console.log("Output from Serper: Success, count", result.organic?.length || 0);
        res.status(200).json(result);

    } catch (error) {
        console.error("Error in findwithjiva:", error);
        if (span) {
            span.recordException(error);
            span.setStatus({
                code: SpanStatusCode.ERROR,
                description: error.message
            });
        }
        res.status(500).json({ error: "Internal server error", message: error.message });
    }
}
async function rerank(query, docs) {
    if (!docs || docs.length === 0) return [];
    const myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    const cleanDocs = docs.map(doc => `${doc.title} ${doc.snippet}`);

    const rerankopt = {
        headers: myHeaders,
        method: "POST",
        body: JSON.stringify({ "query": query, "documents": cleanDocs }),
    };

    try {
        const rerankresp = await fetch("http://localhost:8000/rerank", rerankopt);

        if (!rerankresp.ok) {
            console.error(`Rerank server error status: ${rerankresp.status}`);
            return docs;
        }

        const datares = await rerankresp.json();

        if (!datares || !datares.ranked) {
            return docs;
        }

        const returnable = datares.ranked.map(i => docs[i.index]);
        console.log(`[Rerank Success] Status: ${rerankresp.status}`);
        return returnable;

    } catch (e) {
        console.error("Failed to connect to reranking backend: ", e);
        return docs;
    }
}
module.exports = { findwithjiva };