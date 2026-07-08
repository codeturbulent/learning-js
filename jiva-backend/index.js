require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Proxy endpoint to keep JIVA_API_KEY secure
app.post('/api/assign-plan', async (req, res) => {
    try {
        const { emails, plan_id, expiresAt } = req.body;

        // Basic validation
        if (!emails || !Array.isArray(emails) || emails.length === 0 || !plan_id || !expiresAt) {
            return res.status(400).json({ error: "Missing required fields: emails[], plan_id, or expiresAt" });
        }

        const response = await axios.post(process.env.JIVA_API_URL, {
            emails,
            plan_id,
            expiresAt
        }, {
            headers: {
                'x-api-key': process.env.JIVA_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        res.status(response.status).json(response.data);
    } catch (error) {
        console.error('Proxy Error:', error.response?.data || error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data || { error: 'Internal Server Error', details: error.message };
        res.status(status).json(message);
    }
});

function startServer() {
    return new Promise((resolve) => {
        const server = app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            resolve({ port: PORT, server });
        });
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { startServer };
