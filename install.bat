@echo off
echo ======================================================
echo Telegram Subscription Bot - Complete Installation
echo ======================================================
echo.

echo Step 1: Checking if Node.js is installed...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed or not in PATH.
    echo Please download and install Node.js from https://nodejs.org/
    echo After installation, run this script again.
    pause
    exit /b 1
)
echo Node.js is installed!
echo.

echo Step 2: Installing NPM dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo Failed to install dependencies.
    pause
    exit /b 1
)
echo Dependencies installed successfully!
echo.

echo Step 3: Setting up MongoDB...
call setup-mongodb.bat
echo.

echo Step 4: Checking if .env file exists...
if not exist .env (
    echo Creating default .env file...
    echo # Telegram Bot Token (get from @BotFather)> .env
    echo BOT_TOKEN=your_telegram_bot_token>> .env
    echo # MongoDB Connection URI>> .env
    echo MONGODB_URI=mongodb://localhost:27017/telegram-subscription-bot>> .env
    echo # Payment Provider Token (get from @BotFather when setting up payments)>> .env
    echo PAYMENT_PROVIDER_TOKEN=your_payment_provider_token>> .env
    echo Created .env file - please update it with your actual tokens.
) else (
    echo .env file already exists.
)
echo.

echo Step 5: Initializing database...
call npm run setup-db
echo.

echo Step 6: Verifying database connection...
call npm run check-db
echo.

echo ======================================================
echo Installation Complete!
echo ======================================================
echo.
echo Your Telegram Subscription Bot is now set up.
echo.
echo Before starting the bot:
echo 1. Make sure you've updated your .env file with:
echo    - Your Telegram Bot Token from @BotFather
echo    - Your Payment Provider Token (for payments)
echo.
echo To start the bot, run: npm start
echo For development with auto-reload, run: npm run dev
echo For production deployment, run: npm run start:prod
echo.
pause