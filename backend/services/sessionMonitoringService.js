const postgresRepository = require("../repositories/postgresSessionMonitoringRepository");

class SessionMonitoringService {
  constructor(repository) {
    this.repository = repository;
  }

  async recordSessionBatch(payload) {
    return this.repository.insertSessionRecordingBatch(payload);
  }

  async recordFrontendError(payload) {
    return this.repository.insertFrontendError(payload);
  }

  async recordDeadClick(payload) {
    return this.repository.insertDeadClick(payload);
  }

  async getDeadClicks(sessionId, userId) {
    return this.repository.getDeadClicksBySession(sessionId, userId);
  }

  async listSessions(limit) {
    return this.repository.getSessionSummaries(limit);
  }

  async getSessionReplay(sessionId, userId) {
    return this.repository.getSessionReplay(sessionId, userId);
  }

  async deleteAllReplays() {
    return this.repository.deleteAllSessionRecordings();
  }

  async deleteReplay(sessionId, userId) {
    return this.repository.deleteSessionRecording(sessionId, userId);
  }
}

const sessionMonitoringService = new SessionMonitoringService(postgresRepository);

module.exports = sessionMonitoringService;
