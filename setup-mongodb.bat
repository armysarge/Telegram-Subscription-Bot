@echo off
setlocal enabledelayedexpansion
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

echo Checking MongoDB service status...

REM Check for MongoDB service with a timeout
set "mongodb_service_found=false"
set "possible_services=MongoDB MongoDB28 mongod MongoDBServer"

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
        )
    ) else (
        echo MongoDB service is already running.
    )
) else (
    echo MongoDB service is not installed or has a different name.

    :try_manual_start
    echo.
    echo Trying to start MongoDB manually...

    REM Try to start mongod directly
    start "" /b mongod --dbpath=C:\data\db
    echo Waiting for MongoDB to start...
    timeout /t 5 /nobreak >nul

    REM Check if mongod is running
    tasklist | findstr "mongod.exe" >nul
    if !ERRORLEVEL! NEQ 0 (
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
)

echo.
echo Verifying MongoDB connection...
echo Attempting to connect to MongoDB...

REM Use mongosh (newer client) or mongo (legacy) to test connection
mongosh --eval "db.runCommand({ping:1})" --quiet localhost:27017/test >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo ✅ MongoDB is running and responding to connections!
) else (
    mongo --eval "db.runCommand({ping:1})" --quiet localhost:27017/test >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo ✅ MongoDB is running and responding to connections!
    ) else (
        echo ❌ Could not connect to MongoDB. Please check that:
        echo   1. MongoDB is installed correctly
        echo   2. The MongoDB service is running
        echo   3. Port 27017 is not blocked by firewall

        echo.
        echo Troubleshooting steps:
        echo 1. Try restarting the MongoDB service manually:
        echo    net stop MongoDB ^& net start MongoDB
        echo 2. Check if another process is using port 27017:
        echo    netstat -ano | findstr 27017
        echo 3. Make sure your firewall allows connections to MongoDB
    )
)

echo.
echo To complete setup for the Telegram subscription bot:
echo 1. Run 'npm install' to install dependencies
echo 2. Update the .env file with your bot tokens
echo 3. Run 'npm run setup-db' to initialize the database
echo 4. Run 'npm run check-db' to verify the database connection
echo 5. Start the bot with 'npm start'
echo.
pause