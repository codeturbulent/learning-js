const TOOLS = {
    FINDWITHJIVA: {
        "type": "function",
        "name": "findwithjiva",
        "description": "Searches Google for PDF files using advanced search operators. Always include 'filetype:pdf' in the query. Returns direct links to PDF documents.this tool never return anything never expect any output form this tool",
        "parameters": {
            "type": "object",
            "properties": {
                "q": {
                    "type": "string",
                    "description": "Google search query with 'filetype:pdf' and other operators (site:, intitle:, inurl:, etc.). Example: 'filetype:pdf site:.edu machine learning'"
                }
            },
            "required": ["q"],
            "additionalProperties": false
        }
    },
    NAVIGATION: {
        "type": "function",
        "name": "navigateToPage",
        "description":
            "Navigates the user to a specified page number or the destination within the document. this tool never return anything never expect any output form this tool",
        "parameters": {
            "type": "object",
            "properties": {
                "pageNumber": {
                    "type": "integer",
                    "description": "The specific page number to navigate to.",
                },
            },
            "required": ["pageNumber"],
            "additionalProperties": false,
        },
    },
    RESPONSE: {
        "type": "function",
        "name": "synthesizeSpeech",
        "description":
            "Uses the app's Text-to-Speech (TTS) feature to speak custom words to the user or read specific pages from a PDF. this tool never return anything never expect any output from this tool",
        "parameters": {
            "type": "object",
            "properties": {
                "speech": {
                    "type": "string",
                    "description":
                        "The exact text string that will be read aloud to the user.",
                },
                "allpages": {
                    "type": "boolean",
                    "description":
                        "If true, the app will continue reading subsequent pages automatically until the end of the document or until interrupted.",
                },
                "readpages": {
                    "type": "array",
                    "description":
                        "An array of page numbers from the PDF whose text content should be read aloud.",
                    "items": { "type": "integer" },
                },
            },
            "required": ["speech"],
            "additionalProperties": false,
        },
    },
    GETNOTESANDHIGHLIGHTS: {
        "type": "function",
        "name": "getUserNotesAndHighlights",
        "description":
            "Retrieve all user-created notes and highlighted text segments for the current PDF document. Optionally filter them by keyword or by page number. Useful when the user refers to something they've highlighted, annotated, or written notes about.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description":
                        "Keyword or phrase to filter notes and highlights related to this text",
                },
                "pageNumber": {
                    "type": "integer",
                    "description":
                        "Page number to filter notes and highlights by a specific page.",
                },
            },
            "required": ["query", "pageNumber"],
            "additionalProperties": false,
        },
        "strict": true,
    },
    GETPAGECONTENT: {
        "type": "function",
        "name": "getPageContent",
        "description":
            "Fetch the full text content of specific pages in the current PDF.",
        "strict": true,
        "parameters": {
            "type": "object",
            "properties": {
                "pageNumbers": {
                    "type": "array",
                    "description":
                        "Array of page numbers from the PDF whose text content should be retrieved. Required.",
                    "items": { "type": "integer" },
                },
            },
            "required": ["pageNumbers"],
            "additionalProperties": false,
        },
    },
    SEARCHPDFCONTENT: {
        "type": "function",
        "name": "searchPdfContent",
        "description":
            "Perform a full-text search in the PDF and return matching snippets with page numbers.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description":
                        "Text to search for inside the PDF pages. Required.",
                },
      
                "range": {
                    "type": "array",
                    "description":
                        "Optional array of page numbers to limit the search scope. Can be a list of discrete page numbers [1, 3, 5] or a range [start, end] like [1, 10] for pages 1 to 10 inclusive. If not provided, the entire PDF will be searched.",
                    "items": { "type": "integer" },
                },
            },
            "required": ["query", "range"],
            "additionalProperties": false,
        },
        "strict": true,
    },
    CLARIFICATION: {
        "name": "clarification",
        "description": "Provides a concise clarification of a selected text passage within a reading app. Handles word count limits and ambiguity. this tool never return anything never expect any output form this tool",
        "parameters": {
            "type": "object",
            "properties": {
                "clarification": {
                    "type": "string",
                    "description": "The clear, context-aware simplification of the selected text (max 100 words)."
                },
                "error": {
                    "type": "string",
                    "description": "Error message if the selection is unclear or exceeds the word limit."
                },
                "errorCode": {
                    "type": "string",
                    "enum": ["USER_SELECTION_NOT_CLEAR", "SELECTION_TOO_LONG"],
                    "description": "The specific error code for the failure state."
                }
            }
        }
    }
};

module.exports = TOOLS;
