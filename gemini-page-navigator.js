const apiKey = "AIzaSyC5erK-"; // Replace with your actual API key
const url =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const requestBody = {
  contents: [
    {
      parts: [
        {
          text: `When given an input string related to page navigation (e.g., "turn the page", "go back 10 pages", "next page", or similar phrases), analyze it to determine the direction ("forward" for next/page-turn requests, "backward" for previous/go-back requests) and the number of pages (defaulting to 1 if unspecified). The response must always be a JSON string in this exact format: {"direction": "Direction", "pages_count": number}, where Direction is either "forward" or "backward", and pages_count is an integer (e.g., {"direction": "backward", "pages_count": 10} for "go back 10 pages").

Your Input String: "agla page pe jao"

Example Output:

For "next page" → {"direction": "forward", "pages_count": 1}

For "go back 5 pages" → {"direction": "backward", "pages_count": 5}`,
        },
      ],
    },
  ],
};

fetch(`${url}?key=${apiKey}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(requestBody),
})
  .then((response) => response.json())
  .then((data) => {
    // Extract the generated text from the response
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const generatedText = data.candidates[0].content.parts[0].text;
      console.log("Generated Content:", generatedText);
    } else {
      console.log("No content generated or unexpected response format");
    }
  })
  .catch((error) => console.error("Error:", error));
