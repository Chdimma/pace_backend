const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

console.log("DATABASE_URL is:", process.env.DATABASE_URL);

// Establish the HTTP-based connection to Neon
const sql = neon(process.env.DATABASE_URL);

module.exports = sql;