import { useRef, useState } from "react";
import type {
  PersonalRoute,
  RemovedStop,
  RouteStop,
  StopFact,
  TourPhase,
  TourRoute,
  TourState,
} from "../../../shared/types";
import { routes as curatedRoutes } from "../../../shared/catalog";
import { createId, createOccurrenceId } from "../../../shared/id";
import { completionOf } from "../lib/routeProgress";

type UndoEntry = {
  label: string;
  stops: RouteStop[];
  activeStop: RouteStop | null;
  progressFloor: number;
  dirty: boolean;
  removalIds: string[];
};

type Session = {
  route: TourRoute | null;
  step: number;
  phase: TourPhase;
  pausedFrom: "walking" | "listening" | null;
  /**
   * The stop that owns the current walking/listening segment. It is kept even
   * if the visitor deletes it from the working route mid-segment.
   */
  activeStop: RouteStop | null;
  detached: boolean;
  /** Where to continue after a detached segment finishes. */
  pendingAfter: RouteStop | null;
  /** Position that continuation occupied, used if it is deleted too. */
  pendingAfterIndex: number | null;
  /** Monotonic segment identity; guards stale narration-end events. */
  token: number;
  dirty: boolean;
  notice: string;
  undoStack: UndoEntry[];
  savedRevision: number | null;
  hasSavedVersion: boolean;
  baselineStops: RouteStop[];
};

const initialSession = (token = 0): Session => ({
  route: null,
  step: -1,
  phase: "idle",
  pausedFrom: null,
  activeStop: null,
  detached: false,
  pendingAfter: null,
  pendingAfterIndex: null,
  token,
  dirty: false,
  notice: "",
  undoStack: [],
  savedRevision: null,
  hasSavedVersion: false,
  baselineStops: [],
});

type Options = {
  facts: StopFact[];
  routes: PersonalRoute[];
  removed: RemovedStop[];
  recordFact: (fact: StopFact) => void;
  recordRemoval: (removal: RemovedStop) => void;
  revokeRemoval: (id: string) => void;
  upsertRoute: (route: PersonalRoute) => void;
  reassignFacts: (
    occurrenceIds: string[],
    routeId: string,
    routeName: string,
  ) => void;
};

const completionKey = (route: TourRoute | null): string | null =>
  route?.personalRouteId ?? null;

const indexOfOccurrence = (stops: RouteStop[], id: string | null) =>
  id ? stops.findIndex((s) => s.occurrenceId === id) : -1;

export function useTour(options: Options) {
  const [session, setSession] = useState<Session>(() => initialSession());
  const ref = useRef(session);
  ref.current = session;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  /** Synchronous commit so rapid edits / drag moves never interleave. */
  const commit = (update: (s: Session) => Session) => {
    const next = update(ref.current);
    if (next === ref.current) return;
    ref.current = next;
    setSession(next);
  };

  const snapshot = (s: Session, label: string, removalIds: string[] = []) =>
    ({
      label,
      stops: s.route?.stops.map((x) => ({ ...x })) ?? [],
      activeStop: s.activeStop,
      progressFloor: s.route?.progressFloor ?? 0,
      dirty: s.dirty,
      removalIds,
    }) satisfies UndoEntry;

  const push = (s: Session, entry: UndoEntry): UndoEntry[] =>
    [...s.undoStack, entry].slice(-50);

  /**
   * The next stop after a segment, honouring a detached continuation.
   * Never returns an occurrence that is no longer in the working route.
   */
  const nextAfterActive = (s: Session): RouteStop | null => {
    if (!s.route) return null;
    const stops = s.route.stops;
    if (s.detached) {
      if (
        s.pendingAfter &&
        stops.some((x) => x.occurrenceId === s.pendingAfter!.occurrenceId)
      )
        return s.pendingAfter;
      // The intended continuation was deleted as well: continue from the
      // position it occupied rather than ending the tour abruptly.
      const fallback =
        s.pendingAfterIndex !== null
          ? stops[Math.min(s.pendingAfterIndex, stops.length - 1)]
          : undefined;
      return fallback ?? null;
    }
    return stops[s.step + 1] ?? null;
  };

  const advanceAfterSegment = (s: Session, floorFromSegment: number): Session => {
    if (!s.route) return s;
    const route = {
      ...s.route,
      progressFloor: Math.max(s.route.progressFloor, floorFromSegment),
    };
    const nextStop = nextAfterActive(s);
    if (!nextStop) {
      return {
        ...s,
        route,
        phase: "done",
        step: -1,
        activeStop: null,
        detached: false,
        pendingAfter: null,
        pendingAfterIndex: null,
        token: s.token + 1,
        notice: "这段旅程已完成。",
      };
    }
    const index = indexOfOccurrence(route.stops, nextStop.occurrenceId);
    return {
      ...s,
      route,
      phase: "walking",
      step: index,
      activeStop: route.stops[index],
      detached: false,
      pendingAfter: null,
      pendingAfterIndex: null,
      pausedFrom: null,
      token: s.token + 1,
      notice: "",
    };
  };

  const startRoute = (routeId: string) => {
    const opts = optionsRef.current;
    const personal = opts.routes.find((r) => r.id === routeId);
    if (personal) {
      const stops = personal.stops.map((x) => ({ ...x }));
      const completion = completionOf(
        stops,
        opts.facts,
        personal.progressFloor,
        personal.id,
      );
      const completed = new Set(
        completion.completedFacts.map((f) => f.occurrenceId),
      );
      const firstPending = stops.findIndex(
        (x) => !completed.has(x.occurrenceId),
      );
      const index = firstPending >= 0 ? firstPending : stops.length ? 0 : -1;
      const allDone = firstPending < 0 && stops.length > 0;
      commit((s) => ({
        ...initialSession(s.token + 1),
        route: {
          id: personal.id,
          personalRouteId: personal.id,
          sourceRouteId: personal.sourceRouteId,
          name: personal.name,
          subtitle: personal.subtitle,
          stops,
          revision: personal.revision,
          progressFloor: completion.floor,
        },
        step: index,
        phase: index >= 0 ? "walking" : "done",
        activeStop: index >= 0 ? stops[index] : null,
        savedRevision: personal.revision,
        hasSavedVersion: true,
        baselineStops: stops.map((x) => ({ ...x })),
        notice: allDone
          ? "这条路线已经全部完成，将从第一站开始重访；完成度不会回退。"
          : "",
      }));
      return;
    }
    const curated = curatedRoutes.find((r) => r.id === routeId);
    if (!curated) return;
    const stops = curated.stops.map((artworkId) => ({
      occurrenceId: createOccurrenceId(curated.id),
      artworkId,
    }));
    commit((s) => ({
      ...initialSession(s.token + 1),
      route: {
        id: curated.id,
        personalRouteId: null,
        sourceRouteId: curated.id,
        name: curated.name,
        subtitle: curated.subtitle,
        stops,
        revision: 1,
        progressFloor: 0,
      },
      step: stops.length ? 0 : -1,
      phase: stops.length ? "walking" : "done",
      activeStop: stops[0] ?? null,
      baselineStops: stops.map((x) => ({ ...x })),
    }));
  };

  const arrive = (event: {
    occurrenceId: string | null;
    token: number;
  }) => {
    commit((s) => {
      if (!s.activeStop || s.phase !== "walking") return s;
      if (event.token !== s.token) return s;
      if (event.occurrenceId !== s.activeStop.occurrenceId) return s;
      return { ...s, phase: "listening" };
    });
  };

  /**
   * Narration-end is only trusted when it belongs to the segment the tour is
   * running now. Token, occurrence and artwork must all match, so an utterance
   * that finishes late (after an edit or after the tour moved on) can never be
   * credited to a different stop.
   */
  const completeSegment = (event: {
    artworkId: string;
    segmentId: string | null;
    token: number;
  }) => {
    const s = ref.current;
    const stop = s.activeStop;
    if (!s.route || !stop) return;
    if (event.token !== s.token) return;
    if (event.segmentId !== stop.occurrenceId) return;
    if (event.artworkId !== stop.artworkId) return;
    const opts = optionsRef.current;
    const alreadyKnown = opts.facts.some(
      (f) => f.occurrenceId === stop.occurrenceId,
    );
    if (!alreadyKnown) {
      opts.recordFact({
        id: createId("fact"),
        routeId: s.route.personalRouteId ?? s.route.id,
        routeName: s.route.name,
        occurrenceId: stop.occurrenceId,
        artworkId: stop.artworkId,
        completedAt: Date.now(),
        via: "narration",
      });
    }
    const before = completionOf(
      s.route.stops,
      opts.facts,
      s.route.progressFloor,
      completionKey(s.route),
    );
    // The fact is written through the collection state, which lands on the next
    // render; account for it immediately so the high-water mark never dips.
    const added =
      !alreadyKnown &&
      !before.completedFacts.some(
        (f) => f.occurrenceId === stop.occurrenceId,
      );
    const floorAfter = Math.max(
      s.route.progressFloor,
      before.historical + (added ? 1 : 0),
    );
    commit((prev) => advanceAfterSegment(prev, floorAfter));
  };

  /** Manual skip. Never records completion: the visitor did not hear it. */
  const next = () => {
    commit((s) => {
      if (!s.route || s.phase === "idle" || s.phase === "done") return s;
      const nextStop = nextAfterActive(s);
      if (!nextStop) {
        return {
          ...s,
          phase: "done",
          step: -1,
          activeStop: null,
          detached: false,
          pendingAfter: null,
          pausedFrom: null,
          token: s.token + 1,
          notice: "这段旅程已完成。",
        };
      }
      const index = indexOfOccurrence(s.route.stops, nextStop.occurrenceId);
      return {
        ...s,
        phase: "walking",
        step: index,
        activeStop: s.route.stops[index],
        detached: false,
        pendingAfter: null,
        pendingAfterIndex: null,
        pausedFrom: null,
        token: s.token + 1,
        notice: "",
      };
    });
  };

  const pause = () => {
    commit((s) => {
      if (s.phase !== "walking" && s.phase !== "listening") return s;
      return {
        ...s,
        phase: "paused",
        pausedFrom: s.phase,
        notice: "已暂停：当前目标与讲解段落保持原样。",
      };
    });
  };

  const resume = () => {
    commit((s) => {
      if (s.phase !== "paused") return s;
      return {
        ...s,
        phase: s.pausedFrom === "listening" ? "listening" : "walking",
        pausedFrom: null,
        notice: "",
      };
    });
  };

  const stop = () => {
    commit((s) => initialSession(s.token + 1));
  };

  /**
   * Move one occurrence. The active occurrence keeps its identity, so a
   * walk or narration already in progress is not silently replaced by
   * whichever artwork now happens to sit at its old index.
   */
  const reorder = (from: number, to: number) => {
    commit((s) => {
      if (!s.route) return s;
      const stops = [...s.route.stops];
      if (
        from < 0 ||
        to < 0 ||
        from >= stops.length ||
        to >= stops.length ||
        from === to
      )
        return s;
      const [moved] = stops.splice(from, 1);
      stops.splice(to, 0, moved);
      const activeIndex = indexOfOccurrence(
        stops,
        s.activeStop?.occurrenceId ?? null,
      );
      const detached = !!s.activeStop && activeIndex < 0;
      return {
        ...s,
        route: { ...s.route, stops },
        step: activeIndex >= 0 ? activeIndex : s.step,
        detached,
        dirty: true,
        undoStack: push(s, snapshot(s, "调整站点顺序")),
        notice: s.activeStop
          ? "顺序已更新：当前讲解 / 路程仍前往原目标，结束后按新顺序继续。"
          : "顺序已更新。",
      };
    });
  };

  const removeStop = (occurrenceId: string) => {
    const s = ref.current;
    if (!s.route || !s.route.stops.length) return;
    const index = indexOfOccurrence(s.route.stops, occurrenceId);
    if (index < 0) return;
    const stop = s.route.stops[index];
    const opts = optionsRef.current;
    const completion = completionOf(
      s.route.stops,
      opts.facts,
      s.route.progressFloor,
      completionKey(s.route),
    );
    const removed: RemovedStop = {
      id: createId("removed"),
      routeId: s.route.personalRouteId ?? s.route.id,
      routeName: s.route.name,
      occurrenceId: stop.occurrenceId,
      artworkId: stop.artworkId,
      removedAt: Date.now(),
      completedBeforeRemoval: completion.completedFacts.some(
        (f) => f.occurrenceId === stop.occurrenceId,
      ),
    };
    opts.recordRemoval(removed);
    const isActive = s.activeStop?.occurrenceId === occurrenceId;
    const activeCompleted = completion.completedFacts.some(
      (f) => f.occurrenceId === occurrenceId,
    );
    commit((prev) => {
      if (!prev.route) return prev;
      const stops = prev.route.stops.filter(
        (x) => x.occurrenceId !== occurrenceId,
      );
      // Removing an actually completed stop never lowers the completion
      // high-water mark; removing a pending one invents no completion.
      const floor = Math.max(
        prev.route.progressFloor,
        activeCompleted ? completion.completed : 0,
      );
      const route = { ...prev.route, stops, progressFloor: floor };
      const entry = push(
        prev,
        snapshot(prev, isActive ? "删除当前站" : "删除站点", [removed.id]),
      );
      if (!isActive) {
        const activeIndex = indexOfOccurrence(
          stops,
          prev.activeStop?.occurrenceId ?? null,
        );
        return {
          ...prev,
          route,
          step: prev.activeStop ? activeIndex : -1,
          dirty: true,
          undoStack: entry,
          notice: "已从路线删除该站；已完成的参观记录仍保留。",
        };
      }
      const after = stops[index] ?? stops[index - 1] ?? null;
      const afterIndex = stops.length
        ? Math.min(index, stops.length - 1)
        : null;
      return {
        ...prev,
        route,
        step: stops.length ? Math.min(index, stops.length - 1) : -1,
        // The running segment keeps its artwork and only loses its plan slot.
        activeStop: prev.activeStop,
        detached: true,
        pendingAfter: after,
        pendingAfterIndex: afterIndex,
        dirty: true,
        undoStack: entry,
        notice:
          "当前站已移出路线：这一段的讲解 / 路程仍会完成，结束后再按新顺序继续。",
      };
    });
  };

  /**
   * Inserting the same artwork again is a deliberate revisit. The new
   * occurrence has a new identity, so an earlier completion of the same
   * artwork never marks it complete.
   */
  const addStop = (artworkId: string, at?: number) => {
    commit((s) => {
      if (!s.route) return s;
      const stop: RouteStop = {
        occurrenceId: createOccurrenceId("added"),
        artworkId,
      };
      const stops = [...s.route.stops];
      const index =
        at === undefined
          ? stops.length
          : Math.max(0, Math.min(stops.length, at));
      stops.splice(index, 0, stop);
      const activeIndex = indexOfOccurrence(
        stops,
        s.activeStop?.occurrenceId ?? null,
      );
      const revisits =
        stops.filter((x) => x.artworkId === artworkId).length > 1;
      return {
        ...s,
        route: { ...s.route, stops },
        step: activeIndex >= 0 ? activeIndex : s.step,
        dirty: true,
        undoStack: push(s, snapshot(s, "添加站点")),
        notice: revisits
          ? "已再次加入同一件作品，作为一次新的重访；重访站不会自动算作已完成。"
          : "已加入路线。",
      };
    });
  };

  const undo = () => {
    const s = ref.current;
    const entry = s.undoStack[s.undoStack.length - 1];
    if (!entry || !s.route) return;
    for (const id of entry.removalIds) optionsRef.current.revokeRemoval(id);
    commit((prev) => {
      if (!prev.route) return prev;
      const stops = entry.stops.map((x) => ({ ...x }));
      const activeIndex = indexOfOccurrence(
        stops,
        prev.activeStop?.occurrenceId ?? null,
      );
      return {
        ...prev,
        route: {
          ...prev.route,
          stops,
          progressFloor: Math.max(
            prev.route.progressFloor,
            entry.progressFloor,
          ),
        },
        step: activeIndex >= 0 ? activeIndex : prev.step,
        detached: !!prev.activeStop && activeIndex < 0,
        pendingAfter: activeIndex >= 0 ? null : prev.pendingAfter,
        pendingAfterIndex: activeIndex >= 0 ? null : prev.pendingAfterIndex,
        dirty: entry.dirty,
        undoStack: prev.undoStack.slice(0, -1),
        notice: `已撤销「${entry.label}」。`,
      };
    });
  };

  const save = () => {
    const s = ref.current;
    if (!s.route) return;
    const opts = optionsRef.current;
    const completion = completionOf(
      s.route.stops,
      opts.facts,
      s.route.progressFloor,
      completionKey(s.route),
    );
    const existing = s.route.personalRouteId
      ? opts.routes.find((r) => r.id === s.route!.personalRouteId)
      : undefined;
    const id = existing?.id ?? createId("route");
    const revision = (existing?.revision ?? 0) + 1;
    const saved: PersonalRoute = {
      id,
      sourceRouteId: s.route.sourceRouteId,
      name: s.route.personalRouteId
        ? s.route.name
        : `${s.route.name} · 我的版本`,
      subtitle: s.route.subtitle,
      stops: s.route.stops.map((x) => ({ ...x })),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      revision,
      // Persist the achieved high-water mark so an older version restored
      // after refresh can never report a lower completion.
      progressFloor: Math.max(s.route.progressFloor, completion.floor),
    };
    if (s.route.personalRouteId !== id) {
      // First save of a template working copy: retarget its facts to the new
      // plan so the recap can still find them if the plan is deleted later.
      opts.reassignFacts(
        s.route.stops.map((x) => x.occurrenceId),
        id,
        saved.name,
      );
    }
    opts.upsertRoute(saved);
    commit((prev) =>
      prev.route
        ? {
            ...prev,
            route: {
              ...prev.route,
              personalRouteId: id,
              name: saved.name,
              revision,
              progressFloor: saved.progressFloor,
            },
            dirty: false,
            savedRevision: revision,
            hasSavedVersion: true,
            notice: "已保存为你的个人版本。",
          }
        : prev,
    );
  };

  /** Discard edits, restoring the saved version (or curated template). */
  const revert = () => {
    const s = ref.current;
    if (!s.route) return;
    const opts = optionsRef.current;
    const personal = s.route.personalRouteId
      ? opts.routes.find((r) => r.id === s.route!.personalRouteId)
      : undefined;
    const source = personal?.stops ?? s.baselineStops;
    const stops = source.map((x) => ({ ...x }));
    const activeId = s.activeStop?.occurrenceId ?? null;
    const activeIndex = indexOfOccurrence(stops, activeId);
    const completion = completionOf(
      stops,
      opts.facts,
      Math.max(
        s.route.progressFloor,
        personal?.progressFloor ?? 0,
      ),
      personal?.id ?? null,
    );
    const completedIds = new Set(
      completion.completedFacts.map((f) => f.occurrenceId),
    );
    const firstPending = stops.findIndex(
      (x) => !completedIds.has(x.occurrenceId),
    );
    const fallback =
      firstPending >= 0 ? firstPending : stops.length ? 0 : -1;
    // Stops coming back from the saved version are no longer "removed".
    const restored = new Set(stops.map((x) => x.occurrenceId));
    for (const removal of opts.removed) {
      if (removal.occurrenceId && restored.has(removal.occurrenceId))
        opts.revokeRemoval(removal.id);
    }
    commit((prev) => {
      if (!prev.route) return prev;
      const keepActive = activeIndex >= 0;
      const index = keepActive ? activeIndex : fallback;
      return {
        ...prev,
        route: {
          ...prev.route,
          stops,
          progressFloor: Math.max(
            prev.route.progressFloor,
            completion.floor,
          ),
          revision: personal?.revision ?? 1,
        },
        step: index,
        activeStop: keepActive
          ? prev.activeStop
          : index >= 0
            ? stops[index]
            : null,
        detached: !!prev.activeStop && !keepActive,
        pendingAfter: null,
        pendingAfterIndex: null,
        phase: keepActive ? prev.phase : index >= 0 ? "walking" : "done",
        pausedFrom: keepActive ? prev.pausedFrom : null,
        token:
          keepActive || index < 0 ? prev.token : prev.token + 1,
        dirty: false,
        savedRevision: personal?.revision ?? null,
        hasSavedVersion: !!personal,
        notice:
          "已恢复上次保存的版本；已完成的参观记录与完成度不会回退。",
      };
    });
  };

  const completion = session.route
    ? completionOf(
        session.route.stops,
        options.facts,
        session.route.progressFloor,
        completionKey(session.route),
      )
    : {
        completed: 0,
        total: 0,
        pending: 0,
        historical: 0,
        floor: 0,
        progress: 0,
        completedFacts: [] as StopFact[],
      };

  const state: TourState = {
    routeId: session.route?.personalRouteId ?? session.route?.id ?? null,
    step: session.step,
    phase: session.phase,
    pausedFrom: session.pausedFrom,
    route: session.route,
    activeStop: session.activeStop,
    detached: session.detached,
    token: session.token,
    dirty: session.dirty,
    notice: session.notice,
    undoLabel: session.undoStack.at(-1)?.label ?? null,
    canUndo: session.undoStack.length > 0,
    completed: completion.completedFacts.map((f) => f.occurrenceId),
    completedCount: completion.completed,
    pendingCount: completion.pending,
    historicalCount: completion.floor,
    progressFloor: completion.floor,
    progress: completion.progress,
    savedRevision: session.savedRevision,
    hasSavedVersion: session.hasSavedVersion,
  };

  return {
    state,
    start: startRoute,
    arrive,
    next,
    pause,
    resume,
    stop,
    reorder,
    removeStop,
    addStop,
    undo,
    save,
    revert,
    completeSegment,
  };
}

export type TourApi = ReturnType<typeof useTour>;
