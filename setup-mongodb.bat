@echo off
setlocal enabledelayedexpansion

REM Change to the directory where the batch file is located
cd /d "%~dp0"

echo ===================================================
echo MongoDB Setup Script for Telegram Subscription Bot
echo ===================================================
echo.

echo Checking if MongoDB is installed...

REM Try multiple ways to detect MongoDB
where mongod >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    goto :mongodb_found
)

REM Check program files for MongoDB with version handling
for /d %%G in ("C:\Program Files\MongoDB\Server\*") do (
    if exist "%%G\bin\mongod.exe" (
        set "PATH=%%G\bin;%PATH%"
        goto :mongodb_found
    )
)

for /d %%G in ("C:\Program Files (x86)\MongoDB\Server\*") do (
    if exist "%%G\bin\mongod.exe" (
        set "PATH=%%G\bin;%PATH%"
        goto :mongodb_found
    )
)

REM Check additional common locations
if exist "C:\mongodb\bin\mongod.exe" (
    set "PATH=C:\mongodb\bin;%PATH%"
    goto :mongodb_found
)

REM Check for MongoDB Compass location
if exist "%LOCALAPPDATA%\Programs\MongoDB\mongod.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\MongoDB;%PATH%"
    goto :mongodb_found
)

REM Try to run mongo client to see if it exists
mongo --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    goto :mongodb_found
)

REM Try mongosh (newer MongoDB client)
mongosh --version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    goto :mongodb_found
)

echo MongoDB is not installed or not in PATH.
echo.
echo Please download and install MongoDB Community Server from:
echo https://www.mongodb.com/try/download/community
echo.
echo After installation, run this script again.
pause
exit /b 1

:mongodb_found
echo MongoDB is installed!
echo.

echo Creating data directory if it doesn't exist...
if not exist C:\data\db mkdir C:\data\db

echo Checking if MongoDB is already running...

REM Check if MongoDB is already accessible (this is the most important test regardless of how it was started)
mongosh --eval "db.runCommand({ping:1})" --quiet localhost:27017/test >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✅ MongoDB is already running and accessible on port 27017!
    goto :mongodb_already_running
)

mongo --eval "db.runCommand({ping:1})" --quiet localhost:27017/test >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✅ MongoDB is already running and accessible on port 27017!
    goto :mongodb_already_running
)

REM Also check alternative port
mongosh --eval "db.runCommand({ping:1})" --quiet localhost:27018/test >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✅ MongoDB is already running and accessible on port 27018!
    echo Note: MongoDB is using port 27018 instead of default port 27017
    echo Please ensure your .env file contains: MONGODB_URI=mongodb://localhost:27018/telegram-subscription-bot
    goto :mongodb_already_running
)

REM Check if port 27017 is in use (another sign MongoDB might be running)
netstat -ano | findstr "0.0.0.0:27017.*LISTENING" >nul
if !ERRORLEVEL! EQU 0 (
    echo Port 27017 is already in use. MongoDB might already be running.
    goto :verify_connection
)

netstat -ano | findstr "127.0.0.1:27017.*LISTENING" >nul
if !ERRORLEVEL! EQU 0 (
    echo Port 27017 is already in use. MongoDB might already be running.
    goto :verify_connection
)

echo Checking MongoDB service status...

REM Check for MongoDB service with a timeout
set "mongodb_service_found=false"
set "possible_services=MongoDB MongoDB28 mongod MongoDBServer mongoDB"

REM Check for common MongoDB service names
for %%s in (%possible_services%) do (
    sc query %%s >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        set "mongodb_service_name=%%s"
        set "mongodb_service_found=true"
        echo MongoDB service found: %%s
        goto :service_check_done
    )
)

:service_check_done
if "%mongodb_service_found%"=="true" (
    echo MongoDB service is installed as %mongodb_service_name%.

    REM Check if service is running
    sc query %mongodb_service_name% | findstr "RUNNING" >nul
    if !ERRORLEVEL! NEQ 0 (
        echo Starting MongoDB service...
        net start %mongodb_service_name%
        if !ERRORLEVEL! NEQ 0 (
            echo Failed to start MongoDB service. Trying alternative methods...
            goto :try_manual_start
        ) else (
            echo MongoDB service started successfully.
            goto :verify_connection
        )
    ) else (
        echo MongoDB service is already running.
        goto :verify_connection
    )
) else (
    echo MongoDB service is not installed or has a different name.
    goto :try_manual_start
)

:try_manual_start
echo.
echo Trying to start MongoDB manually...

REM Try to start mongod directly
echo Starting MongoDB on default port 27017...
start "" /b mongod --dbpath=C:\data\db
echo Waiting for MongoDB to start...
timeout /t 5 /nobreak >nul

REM Check if mongod is running
tasklist | findstr "mongod.exe" >nul
if !ERRORLEVEL! NEQ 0 (
    echo Failed to start MongoDB normally.
    echo Trying alternative port 27018...
    start "" /b mongod --dbpath=C:\data\db --port 27018
    timeout /t 5 /nobreak >nul
    echo If successful, please update your .env file with:
    echo MONGODB_URI=mongodb://localhost:27018/telegram-subscription-bot

    echo.
    echo Would you like to install MongoDB as a service? (Y/N)
    set /p install_service=
    if /i "!install_service!"=="Y" (
        echo Installing MongoDB as a service...
        mongod --install --serviceName MongoDB --serviceDisplayName MongoDB --dbpath=C:\data\db
        if !ERRORLEVEL! NEQ 0 (
            echo Failed to install MongoDB as a service.
            echo Please try running the script as Administrator.
        ) else (
            echo Starting MongoDB service...
            net start MongoDB
            if !ERRORLEVEL! NEQ 0 (
                echo Failed to start MongoDB service.
            )
        )
    ) else (
        echo Please make sure MongoDB is running before starting the bot.
    )
) else (
    echo MongoDB started manually.
)

goto :verify_connection

:mongodb_already_running
echo MongoDB is already running and accessible. No need to start it again.
goto :setup_complete

:verify_connection
echo.
echo Verifying MongoDB connection...
echo Attempting to connect to MongoDB...

REM Use mongosh (newer client) or mongo (legacy) to test connection
mongosh --eval "db.runCommand({ping:1})" --quiet localhost:27017/test >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✅ MongoDB is running and responding to connections on port 27017!
) else (
    mongosh --eval "db.runCommand({ping:1})" --quiet localhost:27018/test >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo ✅ MongoDB is running and responding to connections on port 27018!
        echo Please update your .env file to use port 27018:
        echo MONGODB_URI=mongodb://localhost:27018/telegram-subscription-bot
    ) else (
        mongo --eval "db.runCommand({ping:1})" --quiet localhost:27017/test >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            echo ✅ MongoDB is running and responding to connections on port 27017!
        ) else (
            mongo --eval "db.runCommand({ping:1})" --quiet localhost:27018/test >nul 2>&1
            if !ERRORLEVEL! EQU 0 (
                echo ✅ MongoDB is running and responding to connections on port 27018!
                echo Please update your .env file to use port 27018:
                echo MONGODB_URI=mongodb://localhost:27018/telegram-subscription-bot
            ) else (
                echo ❌ Could not connect to MongoDB. Please check that:
                echo   1. MongoDB is installed correctly
                echo   2. The MongoDB service is running
                echo   3. Port 27017 is not blocked by firewall

                echo.
                echo Troubleshooting steps:
                echo 1. Check if port 27017 is already in use:
                netstat -ano | findstr ":27017"
                echo.
                echo 2. Try restarting MongoDB with administrator privileges:
                echo    - Right-click Command Prompt
                echo    - Select "Run as administrator"
                echo    - Then try: net stop MongoDB ^& net start MongoDB
                echo.
                echo 3. Try using a different port:
                echo    - mongod --dbpath=C:\data\db --port 27018
                echo    - Then update your .env file with:
                echo    - MONGODB_URI=mongodb://localhost:27018/telegram-subscription-bot
            )
        )
    )
)

:setup_complete
echo.
echo To complete setup for the Telegram subscription bot:
echo 1. Run 'npm install' to install dependencies
echo 2. Update the .env file with your bot tokens
echo 3. Run 'npm run setup-db' to initialize the database
echo 4. Run 'npm run check-db' to verify the database connection
echo 5. Start the bot with 'npm start'
echo.
pause