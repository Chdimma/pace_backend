const express = require('express');
const router = express.Router();
const { sendAlert } = require('../../services/alertaService');
const mqttclient = require('../../pace_contract/src/config/mqttclient'); // Path to your HiveMQ config in root
const sql = require('../../db'); // Path to your new db.js config in root

// In-memory timer store. Structure: { "userId": Timestamp (ms) }
const postureTimers = new Map();

// 10 minutes in milliseconds (10 mins * 60 secs * 1000 ms)
const ESCALATION_THRESHOLD = 10 * 60 * 1000;

// Helper to broadcast telemetry back to the ESP32 OLED panel via HiveMQ
function broadcastToOled(userId, status) {
  const oledPayload = JSON.stringify({
    userId,
    status,
    timestamp: new Date().toLocaleTimeString()
  });
  
  mqttclient.publish('pace/oled/display', oledPayload, { qos: 1 }, (err) => {
    if (err) console.error("❌ HiveMQ display broadcast error:", err.message);
  });
}

// Endpoint: Called by the ESP32 Hardware Module
router.post('/api/posture-event', async (req, res) => {
  const { userId, postureStatus, postureScore } = req.body;

  // Note: userId here should be the INTEGER ID from your Neon DB 'users' table
  if (!userId || !postureStatus || postureScore === undefined) {
    return res.status(400).json({ error: "Missing userId, postureStatus, or postureScore parameters." });
  }

  try {
    // --- 1. HANDLE ALERTA & ESCALATION ---
    if (postureStatus === 'bad') {
      const currentTime = Date.now();
      
      // If no timer exists, this is the start of a slouching event
      if (!postureTimers.has(userId)) {
        postureTimers.set(userId, currentTime);
        
        // Fire Low Severity alert immediately
        await sendAlert(
          userId.toString(), 
          "Hey! Sit up straight — your posture needs attention.", 
          "low"
        );
      } else {
        // Timer exists, check how long they have been slouching
        const startTime = postureTimers.get(userId);
        const processingDuration = currentTime - startTime;

        if (processingDuration >= ESCALATION_THRESHOLD) {
          // Escalate to High Severity alert
          await sendAlert(
            userId.toString(),
            "PACE Alert: You've been slouching for 10 minutes. Please correct your posture now!",
            "high"
          );
        }
      }
    } else if (postureStatus === 'good') {
      // User corrected their posture; reset their escalation timeline window
      if (postureTimers.has(userId)) {
        postureTimers.delete(userId);
        console.log(`✨ User ${userId} corrected posture. Escalation timer cleared.`);
      }
    }

    // --- 2. SAVE EVENT TO NEONDB ---
    // Inserts event directly into your posture_events table
    await sql`
      INSERT INTO posture_events (user_id, score, posture_status)
      VALUES (${userId}, ${postureScore}, ${postureStatus});
    `;
    console.log(`💾 Posture event successfully saved to NeonDB for User ID: ${userId}`);

    // --- 3. BROADCAST TO MQTT ---
    broadcastToOled(userId, postureStatus);

    return res.status(200).json({ success: true, trackingState: postureStatus });

  } catch (error) {
    console.error("❌ Error processing posture event:", error);
    return res.status(500).json({ error: "Internal processing loop exception" });
  }
});

// Endpoint: Manual Flutter app alert overrides (Stretch reminders, missed goals)
router.post('/api/send-reminder', async (req, res) => {
  const { userId, message, severity } = req.body;

  if (!userId || !message || !severity) {
    return res.status(400).json({ error: "Fields userId, message, and severity are required." });
  }

  const success = await sendAlert(userId, message, severity);

  if (success) {
    return res.status(200).json({ success: true, message: "Manual notification processed." });
  } else {
    return res.status(500).json({ error: "Failed delivering notification through Alerta." });
  }
});

module.exports = router;