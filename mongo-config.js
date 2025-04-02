const fs = require('fs');
const readline = require('readline');
const dotenv = require('dotenv');
const path = require('path');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Load current environment variables
dotenv.config();

// Default MongoDB port
const DEFAULT_PORT = 27017;

// Function to get current MongoDB URI
function getCurrentMongoURI() {
  const envUri = process.env.MONGODB_URI;

  if (!envUri) {
    return `mongodb://localhost:${DEFAULT_PORT}/telegram-subscription-bot`;
  }

  return envUri;
}

// Function to prompt for MongoDB port
function promptForPort() {
  const currentUri = getCurrentMongoURI();
  let currentPort = DEFAULT_PORT;

  // Try to extract current port from MongoDB URI
  const portMatch = currentUri.match(/localhost:(\d+)/);
  if (portMatch && portMatch[1]) {
    currentPort = portMatch[1];
  }

  console.log('MongoDB Configuration');
  console.log('=====================');
  console.log(`Current MongoDB URI: ${currentUri}`);
  console.log(`Current MongoDB port: ${currentPort}`);

  rl.question(`\nEnter MongoDB port number [${currentPort}]: `, (portInput) => {
    // Use default port if no input
    const port = portInput.trim() || currentPort;

    if (isNaN(port)) {
      console.error('Error: Port must be a number');
      rl.close();
      return;
    }

    updateMongoDBPort(port);
    rl.close();
  });
}

// Function to update MongoDB port in .env file
function updateMongoDBPort(port) {
  const envPath = path.resolve(process.cwd(), '.env');
  const currentUri = getCurrentMongoURI();

  // Create new URI with updated port
  const databaseName = currentUri.split('/').pop();
  const newUri = `mongodb://localhost:${port}/${databaseName}`;

  try {
    // Check if .env file exists
    if (fs.existsSync(envPath)) {
      // Read .env file
      let envContent = fs.readFileSync(envPath, 'utf8');

      // Check if MONGODB_URI already exists
      if (envContent.match(/MONGODB_URI=/)) {
        // Replace existing MONGODB_URI
        envContent = envContent.replace(
          /MONGODB_URI=.*/,
          `MONGODB_URI=${newUri}`
        );
      } else {
        // Add MONGODB_URI if it doesn't exist
        envContent += `\nMONGODB_URI=${newUri}`;
      }

      // Write updated content back to .env file
      fs.writeFileSync(envPath, envContent);
      console.log(`MongoDB URI updated to: ${newUri}`);
    } else {
      // Create new .env file if it doesn't exist
      const envContent = `MONGODB_URI=${newUri}\n`;
      fs.writeFileSync(envPath, envContent);
      console.log(`Created .env file with MongoDB URI: ${newUri}`);
    }

    // Update process.env for the current session
    process.env.MONGODB_URI = newUri;

    console.log('Configuration updated successfully!');
  } catch (error) {
    console.error('Error updating MongoDB configuration:', error);
  }
}

// Start the prompting process
promptForPort();

// Export functions for potential reuse
module.exports = {
  promptForPort,
  updateMongoDBPort
};