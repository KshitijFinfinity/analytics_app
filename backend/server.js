const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const trackRoutes = require("./routes/track");
const analyticsRoutes = require("./routes/analytics");

const app = express();
const BASE_PORT = Number(process.env.PORT || 4001);
const MAX_PORT_ATTEMPTS = 5;

app.use(cors());
app.use(express.json({ limit: "40mb" }));

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "analytics-backend" });
});

app.use("/", trackRoutes);
app.use("/analytics", analyticsRoutes);

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