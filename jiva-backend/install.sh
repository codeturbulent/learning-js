#!/bin/bash

# Jiva Pro Unified Installer (Linux & macOS)
# This script installs Git (if missing), clones the repo, and sets up the global 'jiva' command.

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

REPO_URL="https://github.com/DeveloperJiva/assign-subs.git"
TARGET_DIR="$HOME/assign-subs"

printf -- "${BLUE}Starting Unified Jiva Pro Installation...${NC}\n"

# 1. Detect OS and Install Git if missing
OS_TYPE=$(uname -s)

if ! command -v git &> /dev/null; then
    printf -- "${YELLOW}Git is not installed. Attempting to install...${NC}\n"
    if [ "$OS_TYPE" == "Darwin" ]; then
        if ! command -v brew &> /dev/null; then
            printf -- "Homebrew not found. Installing Homebrew first...\n"
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install git
    elif [ "$OS_TYPE" == "Linux" ]; then
        if command -v pacman &> /dev/null; then
            sudo pacman -S --noconfirm git
        elif command -v apt-get &> /dev/null; then
            sudo apt-get update && sudo apt-get install -y git
        else
            printf -- "${YELLOW}Could not detect package manager. Please install git manually.${NC}\n"
            exit 1
        fi
    fi
else
    printf -- "Git is already installed.\n"
fi

# 2. Clone Repository
if [ ! -d "$TARGET_DIR" ]; then
    printf -- "Cloning Jiva Pro repository to ${TARGET_DIR}...\n"
    git clone "$REPO_URL" "$TARGET_DIR"
else
    printf -- "Repository already exists at ${TARGET_DIR}. Pulling latest changes...\n"
    cd "$TARGET_DIR" && git pull
fi

cd "$TARGET_DIR"

# 3. Check for Node.js
printf -- "Checking for Node.js...\n"
if ! command -v node &> /dev/null; then
    printf -- "${YELLOW}Node.js is not installed.${NC} Please install it from https://nodejs.org/\n"
    exit 1
fi

# 4. Install Dependencies
printf -- "Installing project dependencies...\n"
npm install --silent

# 5. Environment Check
if [ ! -f .env ]; then
    printf -- "${YELLOW}Setup: Environment configuration${NC}\n"
    printf -- "Please enter your ${BLUE}JIVA_API_KEY${NC} (or press Enter to skip and configure later): "
    read -r USER_API_KEY

    printf -- "Creating .env file...\n"
    cat > .env <<EOL
PORT=3010
JIVA_API_KEY=${USER_API_KEY:-YOUR_API_KEY_HERE}
JIVA_API_URL=https://us-central1-jiva-flutter.cloudfunctions.net/assignUserPlan
EOL

    if [ -z "$USER_API_KEY" ]; then
        printf -- "${YELLOW}Note:${NC} You'll need to add your API key to the .env file later.\n"
    else
        printf -- "${GREEN}API Key saved successfully!${NC}\n"
    fi
else
    printf -- ".env file already exists. Skipping configuration.\n"
fi


# 6. Setup Global Command
INSTALL_DIR=$(pwd)
BIN_DIR="$HOME/.local/bin"
COMMAND_NAME="jiva"

printf -- "Setting up global command '${COMMAND_NAME}' in ${BIN_DIR}...\n"
mkdir -p "$BIN_DIR"
mkdir -p "$INSTALL_DIR/bin"

cat > "$INSTALL_DIR/bin/jiva" <<EOL
#!/bin/bash
cd "$INSTALL_DIR" && node index.js
EOL

chmod +x "$INSTALL_DIR/bin/jiva"
ln -sf "$INSTALL_DIR/bin/jiva" "$BIN_DIR/$COMMAND_NAME"

# 7. Final Output
printf -- "\n${GREEN}Installation Complete!${NC}\n"
printf -- "--------------------------------------------------\n"
printf -- "You can now run the app from any shell using:\n"
printf -- "  ${BLUE}${COMMAND_NAME}${NC}\n"
printf -- "--------------------------------------------------\n"
printf -- "Project Location: ${TARGET_DIR}\n"
printf -- "Dashboard available at: ${BLUE}http://localhost:3010${NC}\n"

# Check if PATH contains bin dir
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    printf -- "\n${YELLOW}IMPORTANT:${NC} $BIN_DIR is not in your PATH.\n"
    if [[ "$SHELL" == *"zsh"* ]]; then
        printf -- "Add this to your ${BLUE}~/.zshrc${NC}:\n"
        printf -- "  ${YELLOW}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}\n"
    else
        printf -- "Add this to your ${BLUE}~/.bashrc${NC} or profile:\n"
        printf -- "  ${YELLOW}export PATH=\"\$HOME/.local/bin:\$PATH\"${NC}\n"
    fi
    printf -- "Then run: ${BLUE}source ~/.zshrc${NC} (or restart your terminal)\n"
fi
