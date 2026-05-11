const { callgemini } = require("../models/gemini");
const { APIKEYS } = require("../constants/models");
const otel = require("@opentelemetry/api");
const { SpanStatusCode } = require("@opentelemetry/api");

async function findwithjiva(req, res) {
    const span = otel.trace.getActiveSpan();
    if (span) {
        span.updateName("findwithjiva_flow");
    }

    try {
        // Ensure systemtype is set for findwithjiva to use the correct prompt and tools
        req.body.systemtype = "findwithjiva";

        // Ensure input and other expected fields are present
        req.body.input = req.body.input || [];


        let geminiOutput;
        const mockRes = {
            status: function (code) {
                this.statusCode = code;
                return this;
            },
            json: function (data) {
                geminiOutput = data;
                return this;
            },
            setHeader: function (name, value) {
                return this;
            }
        };

        // Call Gemini to generate the Google Dork query
        await callgemini(req, mockRes);

        if (!geminiOutput || !geminiOutput.tools || geminiOutput.tools.length === 0) {
            console.error("Gemini failed to generate a tool call:", geminiOutput);
            const errorResponse = {
                error: "Could not generate search query",
                detail: geminiOutput
            };
            if (span) {
                span.setAttribute("error", true);
                span.setAttribute("error.message", "Gemini failed to generate tool call");
            }
            return res.status(500).json(errorResponse);
        }

        // Extract the generated query from the tool call
        const toolCall = geminiOutput.tools.find(t => t.name === "findwithjiva");
        if (!toolCall || !toolCall.args || !toolCall.args.q) {
            const errorResponse = {
                error: "Invalid tool call format from Gemini",
                detail: geminiOutput
            };
            if (span) {
                span.setAttribute("error", true);
                span.setAttribute("error.message", "Invalid tool call format");
            }
            return res.status(500).json(errorResponse);
        }

        const query = toolCall.args.q;
        if (span) span.setAttribute("search.query", query);

        // Call Serper API with the generated query
        const myHeaders = new Headers();
        myHeaders.append("X-API-KEY", APIKEYS.SERPER);
        myHeaders.append("Content-Type", "application/json");

        const raw = JSON.stringify({
            "q": query
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        const serperResponse = await fetch("https://google.serper.dev/search", requestOptions);

        if (!serperResponse.ok) {
            const errorText = await serperResponse.text();
            throw new Error(`Serper API error: ${serperResponse.status} ${errorText}`);
        }

        const result = await serperResponse.json();
        if (span) {
            span.setAttribute("search.results_count", result.organic?.length || 0);
            span.setStatus({ code: SpanStatusCode.OK });
        }

        // Return the Serper search results to the user
        res.status(200).json(result);

    } catch (error) {
        console.error("Error in findwithjiva:", error);
        if (span) {
            span.recordException(error);
            span.setStatus({ code: SpanStatusCode.ERROR, description: error.message });
        }
        res.status(500).json({
            error: "Internal server error",
            message: error.message
        });
    }
}

module.exports = { findwithjiva };
