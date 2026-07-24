// ==========================================
// 1. CORE PACKAGES & ENVIRONMENT CONFIG
// ==========================================
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ==========================================
// 2. DATABASE, MQTT, & API ROUTE IMPORTS
// ==========================================
const sql = require('./db'); // Path to your NeonDB configuration
const mqttclient = require('./pace_contract/src/config/mqttclient'); // Path to your HiveMQ configuration

// Import your dedicated route modules
const solanaHealthRoutes = require('./routes/routes/solanaHealth');
const alertaRoutes = require('./routes/routes/alertaRoutes');
const authRoutes = require('./routes/routes/authRoutes'); // 1. Import Auth Module

// ==========================================
// 3. EXPRESS APP INITIALIZATION & MIDDLEWARE
// ==========================================
const app = express();
app.use(cors());
app.use(express.json()); // Parses incoming JSON payloads

// ==========================================
// 4. ATTACH EXTERNAL ROUTE MODULES
// ==========================================
app.use(solanaHealthRoutes); // Connects /api/posture-event, /api/health-records/:walletAddress, etc.
app.use(alertaRoutes);       // Connects your Alerta reminder and notification logic
app.use(authRoutes); // 3. Mount Web2/Web3 Unified Auth router

// ==========================================
// 5. LEGACY / CORE ENDPOINTS
// ==========================================

// Global Health Check Route (Verifies server and database status)
app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await sql`SELECT NOW();`;
    res.status(200).json({ 
      status: "Pace master backend operational",
      database: "Connected",
      timestamp: dbCheck[0].now 
    });
  } catch (err) {
    res.status(500).json({ status: "Database unreachable", error: err.message });
  }
});

// Legacy Flutter endpoint for general metrics
app.post('/api/pace-data', async (req, res) => {
  const { metricName, value } = req.body;

  if (!metricName || value === undefined) {
    return res.status(400).json({ error: "Missing metricName or value fields" });
  }

  try {
    // 1. Save data to NeonDB
    const result = await sql`
      INSERT INTO metrics (metric_name, metric_value, created_at)
      VALUES (${metricName}, ${value}, NOW())
      RETURNING *;
    `;

    // 2. Format payload for your ESP32 OLED
    const oledPayload = JSON.stringify({
      displayValue: value,
      updatedAt: new Date().toLocaleTimeString()
    });

    // 3. Broadcast to HiveMQ Topic
    mqttclient.publish('pace/oled/display', oledPayload, { qos: 1 }, (err) => {
      if (err) console.error("Failed to broadcast to HiveMQ:", err);
    });

    // 4. Respond to Flutter Frontend
    res.status(201).json({
      success: true,
      message: "Data recorded and broadcasted successfully",
      data: result[0]
    });

  } catch (error) {
    console.error("Database or Broadcast Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ==========================================
// 6. START THE MASTER APPLICATION SERVER
// ==========================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Pace Master Backend live and running on port ${PORT}`);
});
    