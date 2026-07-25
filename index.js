// ==========================================
// 1. CORE PACKAGES & ENVIRONMENT CONFIG
// ==========================================
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: __dirname + '/.env' });

// ==========================================
// 2. DATABASE, MQTT, & API ROUTE IMPORTS
// ==========================================
const sql = require('./db'); // Path to your NeonDB configuration
const mqttclient = require('./pace_contract/src/config/mqttclient'); // Path to your HiveMQ configuration

// Import your dedicated route modules
const solanaHealthRoutes = require('./routes/routes/solanaHealth');
const alertaRoutes = require('./routes/routes/alertaRoutes');
const authRoutes = require('./routes/routes/authRoutes'); // 1. Import Auth Module
const stretchRoutes = require('./routes/routes/stretchRoutes'); // Stretch timer routes

// ==========================================
// 3. EXPRESS APP INITIALIZATION & MIDDLEWARE
// ==========================================
const app = express();

// Configure CORS to allow requests from the Vercel frontend and local development
const allowedOrigins = [
  'https://pace-fawn.vercel.app',
  'https://pace-backend-delta.vercel.app',
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:3000',
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins in production for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
}));

// Handle preflight OPTIONS requests explicitly
app.options('*', cors());

app.use(express.json()); // Parses incoming JSON payloads

// ==========================================
// 4. ATTACH EXTERNAL ROUTE MODULES
// ==========================================
app.use(solanaHealthRoutes); // Connects /api/posture-event, /api/health-records/:walletAddress, etc.
app.use(alertaRoutes);       // Connects your Alerta reminder and notification logic
app.use(authRoutes); // 3. Mount Web2/Web3 Unified Auth router
app.use(stretchRoutes); // 4. Mount Stretch timer routes

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
    