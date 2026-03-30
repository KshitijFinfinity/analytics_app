const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const trackRoutes = require("./routes/track");
const analyticsRoutes = require("./routes/analytics");
const errorAlertingRoutes = require("./routes/errorAlerting");

const app = express();
const BASE_PORT = Number(process.env.PORT || 4001);
const MAX_PORT_ATTEMPTS = 5;


// Dynamic CORS middleware for all requests
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] || "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "40mb" }));


app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "analytics-backend" });
});


// Logging middleware for debugging
app.post("/track", (req, res, next) => {
  console.log("track request received", req.body);
  next();
});

app.post("/session-record", (req, res, next) => {
  console.log("session record received", req.body);
  next();
});


app.use("/", trackRoutes);
app.use("/api", trackRoutes);
app.use("/api/ingest", trackRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/", errorAlertingRoutes);

// Global error handler for robust error reporting
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.status || 500).json({
    error: true,
    message: err.message || "Internal Server Error",
    details: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

function startServer(port, attemptsLeft) {
  const server = app.listen(port, () => {
    console.log(`Analytics server running on port ${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Retrying on port ${nextPort}...`);
      startServer(nextPort, attemptsLeft - 1);
      return;
    }

    throw error;
  });
}

startServer(BASE_PORT, MAX_PORT_ATTEMPTS);