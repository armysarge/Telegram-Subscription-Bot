@echo off
REM Change to the directory where the batch file is located
cd /d "%~dp0"

echo ======================================================
echo Telegram Subscription Bot - Complete Installation
echo ======================================================
echo.

REM Create a backup of .env file if it exists
if exist .env (
    echo Creating backup of existing .env file...
    copy .env .env.backup >nul
)

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

echo Step 4: MongoDB Port Configuration
set MONGODB_PORT=27017
echo Default MongoDB port is 27017.
set /p USE_CUSTOM_PORT="Would you like to specify a custom MongoDB port? (y/n) [default: n]: "
if /i "%USE_CUSTOM_PORT%"=="y" (
    set /p MONGODB_PORT="Enter MongoDB port number [default: 27017]: "
    if "%MONGODB_PORT%"=="" set MONGODB_PORT=27017
    echo Using MongoDB port: %MONGODB_PORT%
) else (
    echo Using default MongoDB port: 27017
)
echo.

echo Step 5: Checking if .env file exists...
if not exist .env.backup (
    if not exist .env (
        echo Creating default .env file...
        echo # Telegram Bot Token (get from @BotFather)> .env
        echo BOT_TOKEN=your_telegram_bot_token>> .env
        echo # MongoDB Connection URI>> .env
        echo MONGODB_URI=mongodb://localhost:%MONGODB_PORT%/telegram-subscription-bot>> .env
        echo # Payment Provider Token (get from @BotFather when setting up payments)>> .env
        echo PAYMENT_PROVIDER_TOKEN=your_payment_provider_token>> .env
        echo Created .env file - please update it with your actual tokens.
    ) else (
        echo .env file already exists.

        REM Update MongoDB URI in existing .env file if user specified custom port
        if /i "%USE_CUSTOM_PORT%"=="y" (
            echo Updating MongoDB URI in existing .env file to use port %MONGODB_PORT%...

            REM Create a temporary file
            type .env | findstr /v "MONGODB_URI" > .env.temp
            echo MONGODB_URI=mongodb://localhost:%MONGODB_PORT%/telegram-subscription-bot>> .env.temp
            move /y .env.temp .env > nul

            echo MongoDB URI updated in .env file.
        ) else (
            echo Keeping existing MongoDB configuration.
            echo NOTE: If MongoDB is running on a non-default port, you may need to update your
            echo MONGODB_URI in the .env file manually.
        )
    )
) else (
    echo Restoring original .env file from backup...
    copy .env.backup .env /y >nul
    echo Original .env file restored.

    REM Update MongoDB URI in restored .env file if user specified custom port
    if /i "%USE_CUSTOM_PORT%"=="y" (
        echo Updating MongoDB URI in restored .env file to use port %MONGODB_PORT%...

        REM Create a temporary file
        type .env | findstr /v "MONGODB_URI" > .env.temp
        echo MONGODB_URI=mongodb://localhost:%MONGODB_PORT%/telegram-subscription-bot>> .env.temp
        move /y .env.temp .env > nul

        echo MongoDB URI updated in .env file.
    )
)
echo.

echo Step 6: Initializing database...
call npm run setup-db
echo.

echo Step 7: Verifying database connection...
call npm run check-db
echo.

REM Clean up backup file
if exist .env.backup (
    del .env.backup
)

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