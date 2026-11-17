import { useState, useEffect, useCallback } from "react";
import { loadDocument, saveDocument } from "../../../shared/storage";
import { artworkById } from "../../../shared/catalog";
import type {
  PersonalRoute,
  RemovedStop,
  StopFact,
} from "../../../shared/types";
import { createOccurrenceId } from "../../../shared/id";

export function useCollection() {
  const [document, setDocument] = useState(loadDocument);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    setStorageError(!saveDocument(document));
  }, [document]);
  const upsertRoute = useCallback((route: PersonalRoute) => {
    setDocument((d) => ({
      ...d,
      routes: d.routes.some((r) => r.id === route.id)
        ? d.routes.map((r) => (r.id === route.id ? route : r))
        : [...d.routes, route],
    }));
  }, []);
  const recordFact = useCallback((fact: StopFact) => {
    setDocument((d) => {
      const known = d.facts.some(
        (f) =>
          f.occurrenceId === fact.occurrenceId &&
          f.artworkId === fact.artworkId,
      );
      // A segment deleted mid-narration can still finish afterwards. Marking
      // the removal keeps the recap able to tell "deleted plan, actually
      // completed" apart from "deleted plan, never visited".
      const removed = d.removed.map((r) =>
        r.occurrenceId === fact.occurrenceId
          ? { ...r, completedBeforeRemoval: true }
          : r,
      );
      return {
        ...d,
        facts: known ? d.facts : [...d.facts, fact],
        removed,
      };
    });
  }, []);
  return {
    document,
    storageError,
    upsertRoute,
    recordFact,
    /**
     * When a live working route is saved for the first time, its completion
     * facts still point at the template id. Re-attaching them to the new
     * personal route keeps the historical link accurate without changing what
     * was completed or when.
     */
    reassignFacts: (occurrenceIds: string[], routeId: string, routeName: string) =>
      setDocument((d) => {
        const ids = new Set(occurrenceIds);
        let changed = false;
        const facts = d.facts.map((f) => {
          if (!ids.has(f.occurrenceId) || f.routeId === routeId) return f;
          changed = true;
          return { ...f, routeId, routeName };
        });
        return changed ? { ...d, facts } : d;
      }),
    removeRoute: (id: string) =>
      setDocument((d) => ({
        ...d,
        // Completion facts and visit history are immutable and stay behind:
        // deleting a plan must not erase what was actually visited.
        routes: d.routes.filter((r) => r.id !== id),
      })),
    copyRoute: (id: string) => {
      const copyId = `my-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 6)}`;
      setDocument((d) => {
        const source = d.routes.find((r) => r.id === id);
        if (!source) return d;
        const copy: PersonalRoute = {
          ...source,
          id: copyId,
          name: `${source.name} · 副本`,
          stops: source.stops.map((s) => ({
            occurrenceId: createOccurrenceId("copy"),
            artworkId: s.artworkId,
          })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          revision: 1,
          // A copy is a new plan: it inherits no completion facts, and the
          // original route's history is untouched.
          progressFloor: 0,
        };
        return { ...d, routes: [...d.routes, copy] };
      });
      return copyId;
    },
    recordRemoval: (removal: RemovedStop) =>
      setDocument((d) => ({
        ...d,
        removed: d.removed.some((r) => r.id === removal.id)
          ? d.removed
          : [...d.removed, removal],
      })),
    revokeRemoval: (id: string) =>
      setDocument((d) => ({
        ...d,
        removed: d.removed.filter((r) => r.id !== id),
      })),
    toggle: (id: string) =>
      setDocument((d) => ({
        ...d,
        favorites: d.favorites.includes(id)
          ? d.favorites.filter((x) => x !== id)
          : [...d.favorites, id],
      })),
    note: (id: string, text: string) =>
      setDocument((d) => ({ ...d, notes: { ...d.notes, [id]: text } })),
    record: (id: string, seconds: number) => {
      if (!artworkById(id)) return;
      setDocument((d) => {
        const previous = d.visits.find((v) => v.id === id);
        return {
          ...d,
          visits: previous
            ? d.visits.map((v) =>
                v.id === id ? { ...v, seconds: v.seconds + seconds } : v,
              )
            : [...d.visits, { id, seconds, at: Date.now() }],
        };
      });
    },
  };
}

export type CollectionApi = ReturnType<typeof useCollection>;
