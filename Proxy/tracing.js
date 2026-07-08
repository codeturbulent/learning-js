try { require('dotenv').config(); } catch (e) {}
const { register } = require("@arizeai/phoenix-otel");
const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");

register({
  url: "http://localhost:6006/",
  projectName: "Proxy",
  headers: {
    Authorization: `Bearer ${process.env.PHOENIX_API_KEY}`
  },
    apiKey: process.env.PHOENIX_API_KEY,

  instrumentations: [
    new HttpInstrumentation({

      // This ignores all OPTIONS (CORS preflight) requests so they don't clutter Phoenix
      ignoreIncomingRequestHook: (req) => {
        return req.method === 'OPTIONS';
      },
      // Also ignore outgoing OPTIONS if any
      ignoreOutgoingRequestHook: (req) => {
        return req.method === 'OPTIONS';
      }
    }),
  ],
});

console.log("Tracing initialized for project: Proxy (OPTIONS requests filtered out)");
