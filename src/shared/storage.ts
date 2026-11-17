import type {
  GalleryDocument,
  PersonalRoute,
  RemovedStop,
  RouteStop,
  StopFact,
} from "./types";
import { artworks } from "./catalog";
const key = "yujing-gallery-v2";
const legacyKey = "yujing-gallery-v1";
export const emptyDocument = (): GalleryDocument => ({
  favorites: [],
  visits: [],
  notes: {},
  routes: [],
  facts: [],
  removed: [],
});

const knownArtwork = (id: unknown): id is string =>
  typeof id === "string" && artworks.some((a) => a.id === id);
const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;
const number = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

function hydrateStops(value: unknown, prefix: string): RouteStop[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const stop = entry as { occurrenceId?: unknown; artworkId?: unknown };
    if (!knownArtwork(stop.artworkId)) return [];
    return [
      {
        occurrenceId: text(stop.occurrenceId, `${prefix}-${index}`),
        artworkId: stop.artworkId,
      },
    ];
  });
}

function hydrateRoute(value: unknown, index: number): PersonalRoute | null {
  if (!value || typeof value !== "object") return null;
  const route = value as Record<string, unknown>;
  const id = text(route.id);
  if (!id) return null;
  const stops = hydrateStops(route.stops, id);
  return {
    id,
    sourceRouteId: text(route.sourceRouteId, "custom"),
    name: text(route.name, `我的路线 ${index + 1}`),
    subtitle: text(route.subtitle),
    stops,
    createdAt: number(route.createdAt, Date.now()),
    updatedAt: number(route.updatedAt, Date.now()),
    revision: number(route.revision, 1),
    progressFloor: Math.max(0, number(route.progressFloor, 0)),
  };
}

function hydrateFact(value: unknown, index: number): StopFact | null {
  if (!value || typeof value !== "object") return null;
  const fact = value as Record<string, unknown>;
  if (!knownArtwork(fact.artworkId) || typeof fact.occurrenceId !== "string")
    return null;
  return {
    id: text(fact.id, `fact-${index}-${fact.occurrenceId}`),
    routeId: text(fact.routeId),
    routeName: text(fact.routeName),
    occurrenceId: fact.occurrenceId,
    artworkId: fact.artworkId,
    completedAt: number(fact.completedAt, Date.now()),
    via: fact.via === "manual" ? "manual" : "narration",
  };
}

function hydrateRemoved(value: unknown, index: number): RemovedStop | null {
  if (!value || typeof value !== "object") return null;
  const stop = value as Record<string, unknown>;
  if (!knownArtwork(stop.artworkId) || typeof stop.occurrenceId !== "string")
    return null;
  return {
    id: text(stop.id, `removed-${index}-${stop.occurrenceId}`),
    routeId: text(stop.routeId),
    routeName: text(stop.routeName),
    occurrenceId: stop.occurrenceId,
    artworkId: stop.artworkId,
    removedAt: number(stop.removedAt, Date.now()),
    completedBeforeRemoval: stop.completedBeforeRemoval === true,
  };
}

export function loadDocument(): GalleryDocument {
  try {
    const raw = localStorage.getItem(key) ?? localStorage.getItem(legacyKey);
    const d = JSON.parse(raw || "null");
    if (!d) return emptyDocument();
    return {
      favorites: strings(d.favorites).filter(knownArtwork),
      visits: Array.isArray(d.visits)
        ? d.visits.filter(
            (v: { id?: unknown; seconds?: unknown }) =>
              typeof v.id === "string" &&
              typeof v.seconds === "number" &&
              knownArtwork(v.id),
          )
        : [],
      notes: typeof d.notes === "object" && d.notes ? d.notes : {},
      routes: Array.isArray(d.routes)
        ? (d.routes as unknown[])
            .map((route, index) => hydrateRoute(route, index))
            .filter((r): r is PersonalRoute => r !== null)
        : [],
      facts: Array.isArray(d.facts)
        ? (d.facts as unknown[])
            .map((fact, index) => hydrateFact(fact, index))
            .filter((f): f is StopFact => f !== null)
        : [],
      removed: Array.isArray(d.removed)
        ? (d.removed as unknown[])
            .map((stop, index) => hydrateRemoved(stop, index))
            .filter((r): r is RemovedStop => r !== null)
        : [],
    };
  } catch {
    return emptyDocument();
  }
}
export function saveDocument(d: GalleryDocument): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
