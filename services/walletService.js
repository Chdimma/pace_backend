const { Keypair } = require('@solana/web3.js');
const crypto = require('crypto');
const sql = require('../db');

// Simple encryption settings for securing auto-generated private keys in NeonDB
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'auth-super-secret-key-32-chars-long!'; 
const IV_LENGTH = 16;

function encrypt(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function generateNewCustodialWallet() {
    // Generate a new Solana keypair for custodial wallet creation
    const keypair = Keypair.generate();
    return {
        publicKey: keypair.publicKey.toBase58(),
        secretKey: Array.from(keypair.secretKey)
    };
}

async function getOrCreateUserWallet(userId) {
    // 1. Check if user already exists in NeonDB
    const existingUser = await sql`SELECT * FROM users WHERE id = ${userId}`;
    
    if (existingUser.length > 0 && existingUser[0].solana_public_key) {
        return existingUser[0].solana_public_key;
    }

    // 2. No wallet? Generate a completely new Solana Keypair
    const newKeypair = Keypair.generate();
    const publicKeyStr = newKeypair.publicKey.toBase58();
    const secretKeyStr = JSON.stringify(Array.from(newKeypair.secretKey));

    // 3. Encrypt the private key before committing to database storage
    const encryptedSecret = encrypt(secretKeyStr);

    // 4. Update or insert into NeonDB
    if (existingUser.length > 0) {
        await sql`
            UPDATE users 
            SET solana_public_key = ${publicKeyStr}, encrypted_secret_key = ${encryptedSecret}
            WHERE id = ${userId}
        `;
    } else {
        await sql`
            INSERT INTO users (id, solana_public_key, encrypted_secret_key)
            VALUES (${userId}, ${publicKeyStr}, ${encryptedSecret});
        `;
    }

    return publicKeyStr;
}

module.exports = { generateNewCustodialWallet, getOrCreateUserWallet };
