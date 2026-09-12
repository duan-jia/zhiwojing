export const MEETING_COOLDOWN_MS = 60_000
export const MOVE_TIMEOUT_MS = 15_000

export function meetingAllowed(lastMeeting: number | undefined, now = Date.now()) {
  return now - (lastMeeting ?? 0) >= MEETING_COOLDOWN_MS
}

export function moveTimedOut(startedAt: number | undefined, now = Date.now()) {
  return startedAt !== undefined && now - startedAt >= MOVE_TIMEOUT_MS
}

export function idleWakeDelay(random = Math.random) {
  return 4_000 + Math.floor(random() * 6_001)
}
