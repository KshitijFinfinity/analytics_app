
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const trackRoutes = require("./routes/track");
const analyticsRoutes = require("./routes/analytics");
const errorAlertingRoutes = require("./routes/errorAlerting");

const app = express();
const PORT = process.env.PORT || 4001;

// CORS middleware (production-ready)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.options("*", cors());

app.use(express.json({ limit: "40mb" }));

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "analytics-backend" });
});

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// All analytics/event routes must use /api prefix
app.use("/api", trackRoutes);
app.use("/api", analyticsRoutes);
app.use("/api", errorAlertingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: true, message: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || "Internal Server Error",
  });
});

app.listen(PORT, () => {
  console.log(`Analytics backend running on port ${PORT}`);
});

function startServer(port, attemptsLeft) {
  const server = app.listen(port, () => {
    console.log(`Analytics server running on port ${port}`);
  });
