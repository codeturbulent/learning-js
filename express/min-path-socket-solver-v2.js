const { spawn } = require("child_process");

const program = "nc"; // CLI program
const args = ["83.136.249.46", "53789"]; // Modify as needed

const cli = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"] });

let buffer = ""; // Buffer to store incoming data

cli.stdout.on("data", (data) => {
    buffer += data.toString(); // Accumulate output

    // Detect the end of output (modify this condition as needed)
    if (buffer.split("\n").length >= 3) {  
        processGrid(buffer.trim()); // Process only when full data is received
        buffer = ""; // Reset buffer for next interaction
    }
});

cli.stdout.on("data", (data) => {
    buffer += data.toString(); // Accumulate output

    // Detect the end of output (modify this condition as needed)
    if (buffer.split("\n").length >= 3) {  
        processGrid(buffer.trim()); // Process only when full data is received
        buffer = ""; // Reset buffer for next interaction
    }
});

cli.stderr.on("data", (data) => {
    console.error("Error:", data.toString().trim());
});

cli.on("close", (code) => {
    console.log(`CLI program exited with code ${code}`);
});

// Function to process the received grid data
function processGrid(output) {
    console.log("Received Full Output:\n", output);

    let lines = output.split("\n");
    let gridSize = lines[lines.length - 3].split(" ").map(Number);
    let numbers = lines[lines.length - 2].split(" ").map(Number);

    let rows = gridSize[0], cols = gridSize[1];
    let arr = [];

    for (let i = 0; i < rows; i++) {
        arr.push(numbers.slice(i * cols, (i + 1) * cols));

    }

    console.log("Parsed Grid:", arr);

    let result = minPathSum(arr);
    console.log("Calculated Result:", result);

    cli.stdin.write(result + "\n"); // Send the response back
}

// Dynamic Programming function for min path sum
function minPathSum(grid) {
    let rows = grid.length;
    let cols = grid[0].length;
    let dp = Array(rows).fill().map(() => Array(cols).fill(0));

    dp[0][0] = grid[0][0];

    for (let j = 1; j < cols; j++) dp[0][j] = dp[0][j - 1] + grid[0][j];
    for (let i = 1; i < rows; i++) dp[i][0] = dp[i - 1][0] + grid[i][0];

    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]) + grid[i][j];
        }
    }

    return dp[rows - 1][cols - 1];
}
