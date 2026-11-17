import { artworkById } from "../../../shared/catalog";
import type { TourState } from "../../../shared/types";

export type NavigationExplain = {
  /** Artwork the tour is committed to right now. */
  targetArtworkId: string | null;
  /** False when the committed stop was removed and only finishes this segment. */
  continues: boolean;
  /** Human-readable explanation of whether/how the tour continues. */
  label: string;
  /** Stop that will be visited after the current segment, if any. */
  nextArtworkId: string | null;
};

/**
 * Explain spatial navigation during a live edit. The current segment is
 * authoritative: reordering the list never swaps the artwork the visitor is
 * already walking toward or listening to. Only after the segment ends does the
 * new order take over.
 */
export function explainNavigation(
  state: TourState,
): NavigationExplain | null {
  if (!state.route || state.phase === "idle") return null;
  const active = state.activeStop;
  if (!active) {
    if (state.phase === "done")
      return {
        targetArtworkId: null,
        continues: false,
        label: "这段旅程已完成。",
        nextArtworkId: null,
      };
    return null;
  }
  const title = artworkById(active.artworkId)?.title ?? "当前作品";
  const inPlan =
    !state.detached &&
    state.route.stops.some(
      (s) => s.occurrenceId === active.occurrenceId,
    );
  const index = state.route.stops.findIndex(
    (s) => s.occurrenceId === active.occurrenceId,
  );
  const nextStop =
    index >= 0
      ? state.route.stops[index + 1]
      : state.route.stops[
          Math.min(
            Math.max(state.step, 0) + 1,
            state.route.stops.length - 1,
          )
        ];
  const nextTitle = nextStop ? artworkById(nextStop.artworkId)?.title : null;
  if (!inPlan) {
    return {
      targetArtworkId: active.artworkId,
      continues: false,
      label: `当前目标「${title}」已移出路线，这一段仍会完成${nextTitle ? `，之后前往「${nextTitle}」` : "，之后结束导览"}。`,
      nextArtworkId: nextStop?.artworkId ?? null,
    };
  }
  const paused = state.phase === "paused";
  return {
    targetArtworkId: active.artworkId,
    continues: true,
    label: paused
      ? `导览已暂停，目标仍为「${title}」；继续后从这一站接着进行。`
      : `导览目标：${title} · 继续当前段${nextTitle ? `，再来是「${nextTitle}」` : ""}。`,
    nextArtworkId: nextStop?.artworkId ?? null,
  };
}
