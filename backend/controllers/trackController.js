const eventService = require("../services/eventService");
const { getRequestIp, getLocationByIp } = require("../services/ipLocationService");

async function trackEvent(req, res) {
  try {
    const {
      project_id,
      user_id,
      session_id,
      event_name,
      page,
      properties,
    } = req.body;

    const ip = getRequestIp(req);
    const location = await getLocationByIp(ip);

    console.log(`Event received: ${event_name}`);

    await eventService.createEvent({
      project_id,
      user_id,
      session_id,
      event_name,
      page,
      properties,
      country: location.country,
      city: location.city,
      region: location.region,
      timezone: location.timezone,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Track event error:", error.message);
    return res.status(500).json({ error: "Failed to track event" });
  }
}

module.exports = {
  trackEvent,
};
