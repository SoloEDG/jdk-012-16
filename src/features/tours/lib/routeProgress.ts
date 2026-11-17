import type {
  PersonalRoute,
  RouteStop,
  StopFact,
  TourRoute,
  TourState,
} from "../../../shared/types";

/** Artwork id of the segment currently owned by the tour, if any. */
export function tourTarget(t: TourState): string | null {
  return t.activeStop?.artworkId ?? null;
}

export function tourRoute(t: TourState): TourRoute | null {
  return t.route;
}

export type Completion = {
  /** Distinct occurrences of the current plan that have a completion fact. */
  completed: number;
  /** Stops currently in the plan. */
  total: number;
  /** Occurrences in the plan that are still pending. */
  pending: number;
  /** Completion records for the plan's history, including removed stops. */
  historical: number;
  /** High-water completed count that must never decrease. */
  floor: number;
  /** Completed facts for occurrences in the plan, in route order. */
  completedFacts: StopFact[];
  /** Ratio 0..1, clamped. Historical completion can exceed the plan size. */
  progress: number;
};

/**
 * Completion is derived from immutable facts attached to occurrence ids,
 * never from "an artwork with this id appears in the route". The route-level
 * id only contributes to the historical high-water mark, so completions
 * survive stop deletion and version restores without inventing completion for
 * newly inserted occurrences (including revisits of the same artwork).
 */
export function completionOf(
  stops: RouteStop[],
  facts: StopFact[],
  progressFloor = 0,
  routeId: string | null = null,
): Completion {
  const ids = new Set(stops.map((s) => s.occurrenceId));
  const historical = new Map<string, StopFact>();
  for (const fact of facts) {
    const belongs =
      ids.has(fact.occurrenceId) ||
      (!!routeId && fact.routeId === routeId);
    if (!belongs || historical.has(fact.occurrenceId)) continue;
    historical.set(fact.occurrenceId, fact);
  }
  const completedFacts = stops.flatMap((stop) => {
    const fact = historical.get(stop.occurrenceId);
    return fact ? [fact] : [];
  });
  const completed = completedFacts.length;
  const total = stops.length;
  const pending = total - completed;
  const floor = Math.max(progressFloor, historical.size);
  const progress = total
    ? Math.min(1, Math.min(floor, total) / total)
    : floor > 0
      ? 1
      : 0;
  return {
    completed,
    total,
    pending,
    historical: historical.size,
    floor,
    completedFacts,
    progress,
  };
}

export function routeCompletion(route: PersonalRoute, facts: StopFact[]) {
  return completionOf(route.stops, facts, route.progressFloor, route.id);
}

export function workingCompletion(
  route: TourRoute,
  facts: StopFact[],
): Completion {
  return completionOf(
    route.stops,
    facts,
    route.progressFloor,
    // Curated templates are shared: only a saved personal version carries
    // historical completion. Otherwise re-running a template would claim
    // completion for stops that were never heard in this run.
    route.personalRouteId ? route.id : null,
  );
}

/** Number of times each artwork appears in a route (used for revisit badges). */
export function occurrenceCounts(stops: RouteStop[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const stop of stops) {
    counts.set(stop.artworkId, (counts.get(stop.artworkId) || 0) + 1);
  }
  return counts;
}
