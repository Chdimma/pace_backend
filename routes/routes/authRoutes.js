const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sql = require('../../db');
const { generateNewCustodialWallet } = require('../../services/walletService'); // Your wallet service

// Shared registration handler
async function handleRegistration(req, res) {
  const { name, username, email, phoneNumber, password } = req.body;

  if (!password || !name || !username || !email) {
    return res.status(400).json({ error: "Name, username, email, and password are required." });
  }

  try {
    // Check if email or username is already taken
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email} OR username = ${username}
    `;
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "Username or email is already registered." });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Auto-create their cryptographic Solana keypair
    const wallet = generateNewCustodialWallet(); 

    // Insert user matching your Neon schema exactly
    const newUser = await sql`
      INSERT INTO users (name, username, email, phone_number, password_hash, solana_public_key)
      VALUES (${name}, ${username}, ${email}, ${phoneNumber || null}, ${passwordHash}, ${wallet.publicKey})
      RETURNING id, name, username, email, solana_public_key;
    `;

    // Sign login session token
    const token = jwt.sign({ userId: newUser[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      success: true,
      token,
      user: newUser[0]
    });

  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Failed to complete registration." });
  }
}

// 1. REGISTER: Web2 Email/Phone + Password (supports both /register and /signup)
router.post('/api/auth/register', handleRegistration);
router.post('/api/auth/signup', handleRegistration);

// 2. LOGIN: Web2 Email/Username + Password
router.post('/api/auth/login', async (req, res) => {
  const { loginIdentifier, email, phoneNumber, password } = req.body; // Accept multiple field names

  // Support both 'loginIdentifier' and 'email'/'phoneNumber' field names
  const identifier = loginIdentifier || email || phoneNumber;

  if (!identifier || !password) {
    return res.status(400).json({ error: "Please provide credentials and password." });
  }

  try {
    // Find user matching either email or username
    const user = await sql`
      SELECT * FROM users WHERE email = ${identifier} OR username = ${identifier}
    `;

    if (user.length === 0) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign({ userId: user[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user[0].id,
        name: user[0].name,
        username: user[0].username,
        email: user[0].email,
        solanaPublicKey: user[0].solana_public_key
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Failed to sign in." });
  }
});

// 3. WEB3 LOGIN: Direct Solana wallet connection
router.post('/api/auth/solana-login', async (req, res) => {
  const { solanaPublicKey, name, username } = req.body;

  if (!solanaPublicKey) {
    return res.status(400).json({ error: "Solana public key is required." });
  }

  try {
    let user = await sql`SELECT * FROM users WHERE solana_public_key = ${solanaPublicKey}`;

    // If they haven't logged in before, create a placeholder profile
    if (user.length === 0) {
      user = await sql`
        INSERT INTO users (name, username, email, solana_public_key)
        VALUES (
          ${name || 'Solana User'}, 
          ${username || `sol_${solanaPublicKey.substring(0, 8)}`}, 
          ${`sol_${solanaPublicKey}@pace.local`}, -- Placeholder fallback email
          ${solanaPublicKey}
        )
        RETURNING *;
      `;
    }

    const token = jwt.sign({ userId: user[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user[0].id,
        name: user[0].name,
        username: user[0].username,
        solanaPublicKey: user[0].solana_public_key
      }
    });

  } catch (error) {
    console.error("Web3 Sign In error:", error);
    return res.status(500).json({ error: "Web3 login failed." });
  }
});

module.exports = router;