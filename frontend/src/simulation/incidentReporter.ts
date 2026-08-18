/**
 * Client-side incident deduplication.
 *
 * Simulation events (accident / fire / water leak ...) are user-triggered or
 * detected repeatedly across ticks; the backend also deduplicates, but only for
 * /api/stream/verify. This reporter ensures a given category at a given
 * location is only reported once within a cooldown window, preventing
 * duplicate incidents when a condition persists across ticks.
 */

export interface IncidentReporterOptions {
  /** Minimum delay (ms) between two reports of the same category+location. */
  cooldownMs?: number
}

interface LastReport {
  locationKey: string
  reportedAt: number
}

export function createIncidentReporter(options: IncidentReporterOptions = {}) {
  const cooldownMs = options.cooldownMs ?? 30_000
  const last = new Map<string, LastReport>()

  return {
    /**
     * Returns true when a report for `category` at `locationKey` should be
     * sent now (i.e. not a duplicate within the cooldown window).
     */
    shouldReport(category: string, locationKey: string, now: number): boolean {
      const prev = last.get(category)
      if (!prev) return true
      if (prev.locationKey !== locationKey) return true
      return now - prev.reportedAt >= cooldownMs
    },

    /** Record that a report was sent. */
    markReported(category: string, locationKey: string, now: number): void {
      last.set(category, { locationKey, reportedAt: now })
    },
  }
}

export type IncidentReporter = ReturnType<typeof createIncidentReporter>
