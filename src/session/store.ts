import type { SessionState, FixAttempt, EscalationLevel } from "../types.js";

const GC_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export class SessionStore {
  private sessions = new Map<string, SessionState>();
  private gcTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.gcTimer = setInterval(() => this.gc(), GC_INTERVAL_MS);
    this.gcTimer.unref();
  }

  get(id: string): SessionState {
    let session = this.sessions.get(id);
    if (!session) {
      session = {
        id,
        attempts: [],
        fingerprint_counts: new Map(),
        current_level: "NONE",
        created_at: Date.now(),
        resolved: false,
      };
      this.sessions.set(id, session);
    }
    return session;
  }

  addAttempt(sessionId: string, attempt: FixAttempt): number {
    const session = this.get(sessionId);
    session.attempts.push(attempt);
    session.resolved = false;

    const count = (session.fingerprint_counts.get(attempt.error_fingerprint) ?? 0) + 1;
    session.fingerprint_counts.set(attempt.error_fingerprint, count);

    return count;
  }

  updateLevel(sessionId: string, level: EscalationLevel): void {
    this.get(sessionId).current_level = level;
  }

  resolve(sessionId: string): number {
    const session = this.get(sessionId);
    session.resolved = true;
    const total = session.attempts.length;
    session.attempts = [];
    session.fingerprint_counts.clear();
    session.current_level = "NONE";
    return total;
  }

  getAttemptsForFingerprint(sessionId: string, fp: string): FixAttempt[] {
    return this.get(sessionId).attempts.filter(a => a.error_fingerprint === fp);
  }

  private gc(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      const lastActivity = session.attempts.length > 0
        ? session.attempts[session.attempts.length - 1].timestamp
        : session.created_at;
      if (now - lastActivity > SESSION_TTL_MS) {
        this.sessions.delete(id);
      }
    }
  }

  destroy(): void {
    clearInterval(this.gcTimer);
  }
}
