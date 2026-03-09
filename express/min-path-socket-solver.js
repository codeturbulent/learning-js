
const { spawn } = require("child_process");

const program = "nc"; // Replace with your CLI program (e.g., "python3", "node", etc.)
const args = ["83.136.249.46", "53789"]; // Arguments for the program (modify as needed)

const readline = require("readline");

// Replace with your CLI program (e.g., "nc", "python3", "mysql")

const cli = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"] });

// Setup user input reading
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Listen for output from CLI
cli.stdout.on("data", (data) => {
    console.log("Output:", data.toString().trim());
    var output = data.toString().trim().split("\n")
    console.log(output)
    var grid = output[output.length - 3].split(" ")

    var numbers = output[output.length - 2].split(" ")
 
    let arr  = []
    for (let index = 0; index < grid[0]; index++) {
        let tempar = []
        const element = numbers[index];
      
        for (let i = 0; i < grid[1]; i++) {
            tempar.push(Number(numbers[index*Number(grid[1])+i]))
            
        }
       
        arr.push(tempar)
    }
    console.log(arr)
    var res = minPathSum(arr)
    console.log(res)
    // Ask user for the next input
    rl.question("Enter your input: ", (userInput) => {
        cli.stdin.write(userInput + "\n");
    });

});

cli.stderr.on("data", (data) => {
    console.error("Error:", data.toString().trim());
});

// Handle process exit
cli.on("close", (code) => {
    console.log(`CLI program exited with code ${code}`);
    rl.close();
});

function minPathSum(grid1) {
    let rows = grid1.length;
    let cols = grid1[0].length;

    // Initialize DP table
    let dp = Array(rows).fill().map(() => Array(cols).fill(0));
    dp[0][0] = grid1[0][0]; // Start position

    // Fill the first row (can only come from left)
    for (let j = 1; j < cols; j++) {
        dp[0][j] = dp[0][j - 1] + grid1[0][j];
    }

    // Fill the first column (can only come from top)
    for (let i = 1; i < rows; i++) {
        dp[i][0] = dp[i - 1][0] + grid1[i][0];
    }

    // Fill the rest of the DP table
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1]) + grid1[i][j];
        }
    }

    return dp[rows - 1][cols - 1]; // Bottom-right corner contains the minimum sum
}
