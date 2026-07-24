const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error("❌ Database Connection Error: DATABASE_URL is missing in your .env file!");
  process.exit(1);
}

// Create the serverless SQL client
const sql = neon(process.env.DATABASE_URL);

console.log("🐘 NeonDB SQL client initialized successfully.");

module.exports = sql;