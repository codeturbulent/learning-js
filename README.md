# Javascript-Nodejs Collection

A collection of Node.js scripts and Express applications for various tasks including automation, scraping, and AI integration.

## Project Structure

### Root Scripts
- **`ftp-uploader.js`**: An automated FTP client using `basic-ftp` to upload local files (e.g., `testnote.txt`) to a remote server.
- **`gemini-page-navigator.js`**: Integrates with Google's Gemini 2.0 Flash model to parse natural language navigation commands (e.g., "go back 10 pages") into structured JSON data.
- **`google-maps-scraper.js`**: A utility script designed to be run in a browser environment to extract business data from Google Maps search results.
- **`hello-world.js`**: A basic starter script.
- **`second-largest.js`**: A computational utility to find the second largest value in a dataset.

### Email Services (`/Emaillist`)
- **`send-event-tickets.js`**: A robust service that integrates **Firebase Admin SDK (Firestore)** and **Nodemailer** to automate the distribution of event tickets via email.

### Express Applications (`/express`)
- **`tag-api-server.js`**: A lightweight Express API that handles slug-based routing to return JSON metadata for tags.
- **`min-path-socket-solver.js` (and v2)**: A specialized automation script that uses `child_process` to interface with network sockets (via `nc`) to solve algorithmic pathfinding challenges in real-time.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [npm](https://www.npmjs.com/)

## Getting Started

1. Install dependencies for specific modules:
   ```bash
   # For the root directory
   npm install

   # For the Email service
   cd Emaillist && npm install

   # For the Express apps
   cd express && npm install
   ```

2. Run a specific script:
   ```bash
   node ftp-uploader.js
   ```

## Configuration

- **API Keys**: Ensure you replace placeholder keys in `gemini-page-navigator.js` and Firebase credentials in `Emaillist/send-event-tickets.js` before running.
- **FTP**: Update the client configuration in `ftp-uploader.js` with your specific host, user, and password.
