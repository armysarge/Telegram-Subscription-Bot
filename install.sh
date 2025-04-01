#!/bin/bash

echo "======================================================"
echo "Telegram Subscription Bot - Linux Installation"
echo "======================================================"
echo

# Check for Node.js
echo "Step 1: Checking if Node.js is installed..."
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed."
    echo "Please install Node.js using your distribution's package manager:"
    echo "For Debian/Ubuntu: sudo apt update && sudo apt install nodejs npm"
    echo "For RHEL/CentOS/Fedora: sudo dnf install nodejs npm"
    echo "For Arch Linux: sudo pacman -S nodejs npm"
    echo "After installation, run this script again."
    exit 1
fi
echo "Node.js is installed!"
echo

# Check version
NODE_VERSION=$(node -v | cut -d'v' -f2)
echo "Node.js version: $NODE_VERSION"
NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 12 ]; then
    echo "Warning: Node.js version $NODE_VERSION may be too old."
    echo "Recommended version is v12 or higher."
    echo "Consider upgrading Node.js before continuing."
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 1
    fi
fi
echo

# Install dependencies
echo "Step 2: Installing NPM dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Failed to install dependencies."
    exit 1
fi
echo "Dependencies installed successfully!"
echo

# Check for MongoDB
echo "Step 3: Checking if MongoDB is installed..."
if ! command -v mongod &> /dev/null; then
    echo "MongoDB is not installed."
    echo "Would you like to install MongoDB? (This requires sudo privileges) (y/n): "
    read INSTALL_MONGO
    if [ "$INSTALL_MONGO" = "y" ]; then
        echo "Detecting Linux distribution..."

        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$NAME
        elif type lsb_release >/dev/null 2>&1; then
            OS=$(lsb_release -si)
        else
            OS=$(uname -s)
        fi

        echo "Detected OS: $OS"

        if [[ "$OS" == *"Ubuntu"* ]] || [[ "$OS" == *"Debian"* ]]; then
            echo "Installing MongoDB on Debian/Ubuntu..."
            echo "Adding MongoDB repository..."
            wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
            echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
            sudo apt update
            sudo apt install -y mongodb-org
            sudo systemctl start mongod
            sudo systemctl enable mongod
        elif [[ "$OS" == *"CentOS"* ]] || [[ "$OS" == *"Red Hat"* ]] || [[ "$OS" == *"Fedora"* ]]; then
            echo "Installing MongoDB on RHEL/CentOS/Fedora..."
            echo "[mongodb-org-6.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/\$releasever/mongodb-org/6.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-6.0.asc" | sudo tee /etc/yum.repos.d/mongodb-org-6.0.repo
            sudo dnf install -y mongodb-org
            sudo systemctl start mongod
            sudo systemctl enable mongod
        elif [[ "$OS" == *"Arch"* ]]; then
            echo "Installing MongoDB on Arch Linux..."
            sudo pacman -S mongodb
            sudo systemctl start mongodb
            sudo systemctl enable mongodb
        else
            echo "Unsupported distribution for automatic MongoDB installation."
            echo "Please install MongoDB manually according to the documentation:"
            echo "https://docs.mongodb.com/manual/administration/install-on-linux/"
            exit 1
        fi
    else
        echo "Please install MongoDB manually according to the documentation:"
        echo "https://docs.mongodb.com/manual/administration/install-on-linux/"
        echo "After installation, run this script again."
        exit 1
    fi
fi
echo "MongoDB is installed!"
echo

# Check MongoDB status
echo "Checking MongoDB service status..."
if systemctl is-active --quiet mongod; then
    echo "MongoDB service is running."
else
    echo "Starting MongoDB service..."
    sudo systemctl start mongod
    if [ $? -ne 0 ]; then
        echo "Failed to start MongoDB service."
        echo "Please start MongoDB manually before continuing."
    else
        echo "MongoDB service started."
    fi
fi
echo

# Setup .env file
echo "Step 4: Checking if .env file exists..."
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    echo "# Telegram Bot Token (get from @BotFather)" > .env
    echo "BOT_TOKEN=your_telegram_bot_token" >> .env
    echo "# MongoDB Connection URI" >> .env
    echo "MONGODB_URI=mongodb://localhost:27017/telegram-subscription-bot" >> .env
    echo "# Payment Provider Token (get from @BotFather when setting up payments)" >> .env
    echo "PAYMENT_PROVIDER_TOKEN=your_payment_provider_token" >> .env
    echo "Created .env file - please update it with your actual tokens."
else
    echo ".env file already exists."
fi
echo

# Initialize database
echo "Step 5: Initializing database..."
npm run setup-db
echo

# Verify database connection
echo "Step 6: Verifying database connection..."
npm run check-db
echo

# Set permissions
echo "Setting executable permissions for script files..."
chmod +x install.sh
echo "Permissions set."
echo

echo "======================================================"
echo "Installation Complete!"
echo "======================================================"
echo
echo "Your Telegram Subscription Bot is now set up."
echo
echo "Before starting the bot:"
echo "1. Make sure you've updated your .env file with:"
echo "   - Your Telegram Bot Token from @BotFather"
echo "   - Your Payment Provider Token (for payments)"
echo
echo "To start the bot, run: npm start"
echo "For development with auto-reload, run: npm run dev"
echo "For production deployment, run: npm run start:prod"
echo

# PM2 suggestion for production
echo "For production deployment, we recommend using PM2 to manage the bot process."
echo "Would you like to install PM2? (y/n): "
read INSTALL_PM2
if [ "$INSTALL_PM2" = "y" ]; then
    npm install -g pm2
    if [ $? -eq 0 ]; then
        echo "PM2 installed successfully."
        echo "To run the bot with PM2:"
        echo "  pm2 start bot.js --name telegram-subscription-bot"
        echo "To ensure the bot starts on system reboot:"
        echo "  pm2 startup"
        echo "  pm2 save"
    else
        echo "Failed to install PM2. You can install it manually later if needed."
    fi
fi

echo "Installation script completed."