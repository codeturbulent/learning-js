const TOOLS = {
    DOCUMENTNAVIGATION: (type) => {
        return {
            "type": "function",
            "name": "document_navigation_response",
            "description":
                "Respond to user's document navigation or question command.",
            "parameters": {
                "type": "object",
                "properties": {
                    "intent": {
                        "type": "string",
                        "enum": type == "advanced voice" ? [
                            "basic_navigation",
                            "topic_navigation",
                            "basic_response",
                            "topic_summary",
                            "topic_exploration",
                            "annotations_exploration",
                            "content_narration",
                            "intent_unclear",
                        ] : [
                            "basic_navigation",
                            "basic_response",
                            "content_narration",
                            "intent_unclear",
                        ]
                    },
                    "direction": {
                        "type": "string",
                        "description": "Direction of movement if navigating.",
                        "enum": ["forward", "backward", "null"]
                    },
                    "page_count": {
                        "type": "integer",
                        "description": "Number of pages to move."
                    },
                    "target_page": {
                        "type": "integer",
                        "description": "Specific page number to jump to."
                    },
                    "section": {
                        "type": "string",
                        "description": "Specific document section title."
                    },

                    "read_aloud": {
                        "type": "string",
                        "description": "Narration mode if applicable.",
                        "enum": ["full_page"]
                    },
                    "speech": {
                        "type": "string",
                        "description": "The verbal response text for the user."
                    },
                    "confidence": {
                        "type": "number",
                        "description": "Confidence score of the intent classification."
                    }
                },
                "required": [
                    "intent",
                    "direction",
                    "page_count",
                    "target_page",
                    "section",
                    "read_aloud",
                    "speech",
                    "confidence",
                ],
                "additionalProperties": false,
            },
            "strict": true,
        }
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
            "required": ["query","pageNumber"],
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
    GETTOPICNAVIGATION: {
        "type": "function",
        "name": "getTopicNavigationInfo",
        "description":
            "Find where a given topic, word, or phrase is discussed in the PDF. Returns the most relevant page number and chapter (if available).",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description":
                        "Topic, keyword, or phrase to locate within the PDF. Required.",
                },
            },
            "required": ["query"],
            "additionalProperties": false,
        },
        "strict": true,
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
                "maxResults": {
                    "type": "integer",
                    "description": "Maximum number of search results to return",
                },
            },
            "required": ["query","maxResults"],
            "additionalProperties": false,
        },
        "strict": true,
    }
};

module.exports = TOOLS;
