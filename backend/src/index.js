const express = require("express");
const cors = require("cors");
const createSimulator = require("./simulator");

const PORT = process.env.PORT || 4000;
const STEP_INTERVAL_MS = Number(process.env.STEP_INTERVAL_MS || 5000);

const simulator = createSimulator();

setInterval(() => {
  simulator.step();
}, STEP_INTERVAL_MS);

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", updatedAt: Date.now() });
});

app.get("/api/state", (_req, res) => {
  res.json(simulator.getState());
});

app.get("/api/history", (req, res) => {
  const limit = Math.max(1, Math.min(120, Number(req.query.limit) || 20));
  res.json({ history: simulator.getHistory(limit) });
});

app.get("/api/config", (_req, res) => {
  res.json(simulator.getConfig());
});

app.post("/api/step", (_req, res) => {
  simulator.step();
  res.json(simulator.getState());
});

app.post("/api/override", (req, res) => {
  try {
    const { id, approach, durationSeconds } = req.body || {};
    const override = simulator.overrideSignal({ id, approach, durationSeconds });
    res.json({ override });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/mode", (req, res) => {
  try {
    const { mode } = req.body || {};
    const result = simulator.setMode(mode);
    res.json({ mode: result.mode });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/smart-mode", (req, res) => {
  try {
    const enabled = typeof req.body?.enabled === "boolean" ? req.body.enabled : Boolean(req.body?.enabled);
    const result = simulator.setSmartMode(enabled);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled server error", err);
  res.status(500).json({ error: "Internal server error" });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Traffic simulator backend listening on port ${PORT}`);
  });
}

// Export for Vercel serverless
module.exports = app;
