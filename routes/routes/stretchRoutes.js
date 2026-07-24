const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const sql = require('../../db');

// Middleware to extract user from JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Stretch interval in minutes (configurable)
const STRETCH_INTERVAL_MINUTES = 20;

// POST /api/stretch/complete - Mark a stretch as completed
router.post('/api/stretch/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Record the stretch completion
    await sql`
      INSERT INTO stretch_logs (user_id, completed_at)
      VALUES (${userId}, NOW());
    `;

    // Calculate next stretch time
    const nextStretch = new Date(Date.now() + STRETCH_INTERVAL_MINUTES * 60 * 1000);

    return res.status(200).json({
      success: true,
      message: "Stretch completed!",
      nextStretch: nextStretch.toISOString(),
      intervalMinutes: STRETCH_INTERVAL_MINUTES
    });

  } catch (error) {
    console.error("Stretch complete error:", error);
    return res.status(500).json({ error: "Failed to record stretch." });
  }
});

// GET /api/stretch/status - Get current stretch status
router.get('/api/stretch/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    // Get the most recent stretch completion
    const lastStretch = await sql`
      SELECT completed_at FROM stretch_logs
      WHERE user_id = ${userId}
      ORDER BY completed_at DESC
      LIMIT 1;
    `;

    let nextStretch;
    let isReady = false;

    if (lastStretch.length > 0) {
      // Calculate next stretch time based on last completion
      nextStretch = new Date(lastStretch[0].completed_at);
      nextStretch.setMinutes(nextStretch.getMinutes() + STRETCH_INTERVAL_MINUTES);
      isReady = new Date() >= nextStretch;
    } else {
      // No stretch ever completed - set first one soon
      nextStretch = new Date(Date.now() + 60 * 1000); // 1 minute from now for first-time users
      isReady = false;
    }

    // Get today's stretch count
    const todayCount = await sql`
      SELECT COUNT(*) as count FROM stretch_logs
      WHERE user_id = ${userId}
        AND completed_at >= CURRENT_DATE
        AND completed_at < CURRENT_DATE + INTERVAL '1 day';
    `;

    return res.status(200).json({
      success: true,
      nextStretch: nextStretch.toISOString(),
      isReady,
      intervalMinutes: STRETCH_INTERVAL_MINUTES,
      todayCount: parseInt(todayCount[0].count) || 0
    });

  } catch (error) {
    console.error("Stretch status error:", error);
    return res.status(500).json({ error: "Failed to get stretch status." });
  }
});

module.exports = router;