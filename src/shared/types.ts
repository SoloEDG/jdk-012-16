export type Point = { x: number; z: number };
export type Artwork = {
  id: string;
  title: string;
  en: string;
  artist: string;
  year: string;
  medium: string;
  color: string;
  position: Point;
  facing: number;
  description: string;
  transcript: string[];
  duration: number;
};

/** A route as defined by the gallery. Curated routes are templates only. */
export type Route = {
  id: string;
  name: string;
  subtitle: string;
  stops: string[];
};

/**
 * One insertion of an artwork into a route. `occurrenceId` is the identity of
 * this particular stop, not of the artwork, so inserting the same artwork twice
 * creates two independent (revisit) stops.
 */
export type RouteStop = {
  occurrenceId: string;
  artworkId: string;
};

/** A visitor-saved personal version of a route. */
export type PersonalRoute = {
  id: string;
  sourceRouteId: string;
  name: string;
  subtitle: string;
  stops: RouteStop[];
  createdAt: number;
  updatedAt: number;
  revision: number;
  /**
   * High-water mark of completed stops. Kept so restoring an older saved
   * version (or deleting an already completed stop) never makes the recorded
   * completion move backwards. It never invents completion for new stops.
   */
  progressFloor: number;
};

/** An immutable fact: this particular route occurrence was actually completed. */
export type StopFact = {
  id: string;
  routeId: string;
  routeName: string;
  occurrenceId: string;
  artworkId: string;
  completedAt: number;
  via: "narration" | "manual";
};

/** A planned stop that the visitor removed from a route. */
export type RemovedStop = {
  id: string;
  routeId: string;
  routeName: string;
  occurrenceId: string;
  artworkId: string;
  removedAt: number;
  completedBeforeRemoval: boolean;
};

export type Visit = { id: string; seconds: number; at: number };
export type GalleryDocument = {
  favorites: string[];
  visits: Visit[];
  notes: Record<string, string>;
  routes: PersonalRoute[];
  facts: StopFact[];
  removed: RemovedStop[];
};

export type TourPhase = "idle" | "walking" | "listening" | "paused" | "done";

/** The active, editable route of a tour session. */
export type TourRoute = {
  id: string;
  /** Saved personal route id when this working route came from one. */
  personalRouteId: string | null;
  sourceRouteId: string;
  name: string;
  subtitle: string;
  stops: RouteStop[];
  revision: number;
  /** High-water completed count for this working plan. Never decreases. */
  progressFloor: number;
};

export type TourState = {
  routeId: string | null;
  /** Index of the active occurrence in the current order; -1 when none. */
  step: number;
  phase: TourPhase;
  /** Segment that was running when the tour was paused. */
  pausedFrom: "walking" | "listening" | null;
  route: TourRoute | null;
  /** The current segment's stop identity, kept even if it is removed live. */
  activeStop: RouteStop | null;
  /** True when the active occurrence was removed while its segment continues. */
  detached: boolean;
  /** Incremented for every new walking/listening segment; guards late events. */
  token: number;
  dirty: boolean;
  notice: string;
  undoLabel: string | null;
  canUndo: boolean;
  /** Occurrence ids known to be completed. */
  completed: string[];
  completedCount: number;
  pendingCount: number;
  /** All completion records for this plan's history, including removed stops. */
  historicalCount: number;
  /** Historical high-water completion count. */
  progressFloor: number;
  /** Monotonic progress in 0..1, derived from facts plus the high-water mark. */
  progress: number;
  savedRevision: number | null;
  hasSavedVersion: boolean;
};

export type AudioState = {
  artworkId: string | null;
  elapsed: number;
  playing: boolean;
  rate: number;
  /** Identity of the segment that owns this audio, if any. */
  segmentId: string | null;
  token: number;
};

export type NarrationEnd = {
  artworkId: string;
  segmentId: string | null;
  token: number;
};

export type Command =
  | { type: "focus"; id: string }
  | { type: "favorite"; id: string };
