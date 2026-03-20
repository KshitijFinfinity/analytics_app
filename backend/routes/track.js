const express = require("express");
const { trackEvent } = require("../controllers/trackController");
const {
  createSessionRecording,
  createFrontendError,
  createDeadClick,
} = require("../controllers/sessionRecordingController");
const {
  recordClickEvent,
  recordHoverEvent,
  recordScrollEvent,
  recordPageSnapshotEvent,
} = require("../controllers/heatmapController");

const router = express.Router();

router.post("/track", trackEvent);
router.post("/session-record", createSessionRecording);
router.post("/frontend-error", createFrontendError);
router.post("/dead-click", createDeadClick);
router.post("/heatmap/click", recordClickEvent);
router.post("/heatmap/hover", recordHoverEvent);
router.post("/heatmap/scroll", recordScrollEvent);
router.post("/heatmap/snapshot", recordPageSnapshotEvent);

module.exports = router;