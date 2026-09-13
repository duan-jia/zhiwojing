export const MEETING_COOLDOWN_MS = 60_000
export const MOVE_TIMEOUT_MS = 15_000
export const MODEL_REFRESH_MS = 30_000
export const MODEL_TIMEOUT_MS = 5_000

export function meetingAllowed(lastMeeting: number | undefined, now = Date.now()) {
  return now - (lastMeeting ?? 0) >= MEETING_COOLDOWN_MS
}

export function moveTimedOut(startedAt: number | undefined, now = Date.now()) {
  return startedAt !== undefined && now - startedAt >= MOVE_TIMEOUT_MS
}

export function idleWakeDelay(random = Math.random) {
  return 2_000 + Math.floor(random() * 3_001)
}

export function modelRetryDelay(failures: number) {
  return 15_000 * (2 ** Math.min(Math.max(failures - 1, 0), 2))
}

export function chooseLocation<T extends { id: string }>(
  locations: readonly T[],
  excludedIds: readonly (string | undefined)[],
  random = Math.random,
): T | undefined {
  const excluded = new Set(excludedIds.filter((id): id is string => Boolean(id)))
  const candidates = locations.filter(location => !excluded.has(location.id))
  const pool = candidates.length > 0 ? candidates : locations
  if (pool.length === 0) return undefined
  return pool[Math.min(Math.floor(random() * pool.length), pool.length - 1)]
}
