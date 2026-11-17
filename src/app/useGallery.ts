import { useEffect, useRef } from "react";
import { useWalker, distance, viewingPoint } from "../features/space";
import { useCatalog } from "../features/catalog";
import { useNarration } from "../features/narration";
import { useTour } from "../features/tours";
import { useCollection } from "../features/collection";
import { artworkById } from "../shared/catalog";
import type { NarrationEnd } from "../shared/types";

export function useGallery() {
  const catalog = useCatalog();
  const collection = useCollection();
  const tour = useTour({
    facts: collection.document.facts,
    routes: collection.document.routes,
    removed: collection.document.removed,
    recordFact: collection.recordFact,
    recordRemoval: collection.recordRemoval,
    revokeRemoval: collection.revokeRemoval,
    upsertRoute: collection.upsertRoute,
    reassignFacts: collection.reassignFacts,
  });
  const walker = useWalker(catalog.observe);
  const narration = useNarration((event: NarrationEnd) => {
    // The tour validates the tag itself; the phase check is only a fast path.
    tour.completeSegment(event);
  });

  /** Move without touching the tour: used by the tour's own navigation. */
  const navigate = (id: string) => {
    const a = artworkById(id);
    if (!a) return;
    catalog.select(id);
    walker.go(viewingPoint(a.position, a.facing));
    walker.yaw.current = a.facing;
  };

  /**
   * Visitor-initiated navigation. During a live tour this pauses the current
   * segment instead of rewriting it, so the half-heard artwork and its
   * completion attribution stay stable.
   */
  const go = (id: string) => {
    if (tour.state.phase === "walking" || tour.state.phase === "listening") {
      tour.pause();
      narration.pause();
    }
    navigate(id);
  };

  useEffect(() => {
    const { phase, activeStop } = tour.state;
    if (phase === "walking" && activeStop) navigate(activeStop.artworkId);
    // Reordering intentionally keeps activeStop identity stable, so this does
    // not re-target a walk that is already under way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.state.phase, tour.state.activeStop?.occurrenceId, tour.state.token]);

  useEffect(() => {
    const { phase, activeStop, token, pausedFrom } = tour.state;
    if (phase !== "walking" || !activeStop) return;
    const a = artworkById(activeStop.artworkId);
    if (!a) return;
    if (
      distance(walker.position, viewingPoint(a.position, a.facing)) < 0.15
    ) {
      tour.arrive({
        occurrenceId: activeStop.occurrenceId,
        token,
      });
      narration.play(activeStop.artworkId, {
        segmentId: activeStop.occurrenceId,
        token,
      });
    }
    // pausedFrom is referenced to keep the effect honest across resumes.
    void pausedFrom;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walker.position,
    tour.state.phase,
    tour.state.activeStop?.occurrenceId,
    tour.state.token,
  ]);

  const current = useRef({ nearby: catalog.nearby, record: collection.record });
  current.current = { nearby: catalog.nearby, record: collection.record };
  useEffect(() => {
    const t = setInterval(() => {
      if (current.current.nearby)
        current.current.record(current.current.nearby, 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return {
    catalog,
    tour,
    collection,
    walker,
    narration,
    go,
    pauseTour: () => {
      tour.pause();
      walker.stop();
      narration.pause();
    },
    resumeTour: () => {
      const wasListening = tour.state.pausedFrom === "listening";
      const stop = tour.state.activeStop;
      tour.resume();
      if (!stop) return;
      // A manual detour may have moved the visitor away; resume returns to the
      // segment that was paused instead of re-targeting a different stop.
      navigate(stop.artworkId);
      if (wasListening) {
        narration.play(stop.artworkId, {
          segmentId: stop.occurrenceId,
          token: tour.state.token,
        });
      }
    },
    stopTour: () => {
      tour.stop();
      walker.stop();
      narration.pause();
    },
    nextTour: () => {
      walker.stop();
      narration.pause();
      tour.next();
    },
  };
}
