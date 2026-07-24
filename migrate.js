const sql = require('./db');

async function migrate() {
  try {
    // Add missing solana_public_key column
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS solana_public_key TEXT`;
    console.log('✅ Added solana_public_key column to users table');
    
    // Add encrypted_secret_key column if missing
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS encrypted_secret_key TEXT`;
    console.log('✅ Added encrypted_secret_key column to users table');
    
    // Create stretch_logs table for stretch timer tracking
    await sql`
      CREATE TABLE IF NOT EXISTS stretch_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completed_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `;
    console.log('✅ Created stretch_logs table');
    
    // Add index for faster queries
    await sql`
      CREATE INDEX IF NOT EXISTS idx_stretch_logs_user_id 
      ON stretch_logs(user_id, completed_at DESC);
    `;
    console.log('✅ Added index on stretch_logs');
    
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

migrate();