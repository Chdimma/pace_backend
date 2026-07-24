require('dotenv').config();

const ALERTA_BASE_URL = 'https://api.alerta.encrisoft.com/v2';

/**
 * Dispatches a push notification via Encrisoft Alerta
 * @param {string} userId - Unique identifier for the user
 * @param {string} message - Text notification payload 
 * @param {string} severity - low | medium | high
 */
async function sendAlert(userId, message, severity) {
  const apiKey = process.env.ALERTA_API_KEY;
  const apiSecret = process.env.ALERTA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('❌ Alerta Service Error: API credentials missing in .env');
    return false;
  }

  try {
    const response = await fetch(`${ALERTA_BASE_URL}/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-api-secret': apiSecret
      },
      body: JSON.stringify({
        userId: userId,
        message: message,
        severity: severity,
        channel: 'telegram' // Routes message to the user's Telegram integration
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`⚠️ Alerta API returned error status (${response.status}):`, errorText);
      return false;
    }

    console.log(`🔔 Alerta successfully sent [Severity: ${severity}] to User: ${userId}`);
    return true;
  } catch (error) {
    // Gracefully catch system-level network dropping without crashing Node.js
    console.error('❌ Failed connecting to Encrisoft Alerta network infrastructure:', error.message);
    return false;
  }
}

module.exports = { sendAlert };