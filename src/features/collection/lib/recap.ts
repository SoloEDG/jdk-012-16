import type { GalleryDocument, PersonalRoute } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import { routeCompletion } from "../../tours/lib/routeProgress";

/** Walk-through stats. Only actual visits count; plans never inflate them. */
export function recapStats(d: GalleryDocument) {
  return {
    seen: d.visits.filter((v) => v.seconds >= 2).length,
    seconds: Math.round(d.visits.reduce((n, v) => n + v.seconds, 0)),
    saved: d.favorites.length,
  };
}

export type RouteRecap = {
  route: PersonalRoute;
  completed: number;
  total: number;
  floor: number;
  progress: number;
  completedTitles: string[];
  pendingTitles: string[];
  removed: { title: string; completed: boolean }[];
};

/**
 * Per-route recap that keeps three things apart:
 * 1. what was actually completed (immutable facts),
 * 2. what is still pending in the current plan,
 * 3. what was planned and then removed (with whether it had been visited).
 */
export function routeRecaps(d: GalleryDocument): RouteRecap[] {
  return d.routes.map((route) => {
    const c = routeCompletion(route, d.facts);
    const completed = new Set(
      c.completedFacts.map((f) => f.occurrenceId),
    );
    const pendingTitles = route.stops
      .filter((s) => !completed.has(s.occurrenceId))
      .map((s) => artworkById(s.artworkId)?.title ?? s.artworkId);
    const completedTitles = c.completedFacts.map(
      (f) => artworkById(f.artworkId)?.title ?? f.artworkId,
    );
    const removed = d.removed
      .filter((r) => r.routeId === route.id)
      .map((r) => ({
        title: artworkById(r.artworkId)?.title ?? r.artworkId,
        completed: r.completedBeforeRemoval,
      }));
    return {
      route,
      completed: c.completed,
      total: c.total,
      floor: c.floor,
      progress: c.progress,
      completedTitles,
      pendingTitles,
      removed,
    };
  });
}

export type RemovedRouteHistory = {
  routeId: string;
  routeName: string;
  titles: string[];
};

/**
 * Routes the visitor deleted after visiting some stops. Their plans are gone
 * but the completed visits remain facts, so the recap still reports them.
 */
export function removedRouteHistory(d: GalleryDocument): RemovedRouteHistory[] {
  const live = new Set(d.routes.map((r) => r.id));
  const gone = new Map<string, RemovedRouteHistory>();
  for (const fact of d.facts) {
    if (live.has(fact.routeId)) continue;
    const entry = gone.get(fact.routeId) ?? {
      routeId: fact.routeId,
      routeName: fact.routeName || "已删除的路线",
      titles: [],
    };
    const title = artworkById(fact.artworkId)?.title ?? fact.artworkId;
    if (!entry.titles.includes(title)) entry.titles.push(title);
    gone.set(fact.routeId, entry);
  }
  return [...gone.values()];
}

export function createRecap(d: GalleryDocument): string {
  const stats = recapStats(d);
  const recaps = routeRecaps(d);
  const removedRoutes = removedRouteHistory(d);
  const lines = [
    "余境 · 我的参观回顾",
    `观看 ${stats.seen} 件作品 · 停留 ${stats.seconds} 秒`,
    "",
    ...d.favorites.map((id) => {
      const a = artworkById(id);
      return a
        ? `${a.title} / ${a.artist}
${d.notes[id] || "未添加感想"}
停留 ${Math.round(d.visits.find((v) => v.id === id)?.seconds || 0)} 秒`
        : "";
    }),
  ];
  if (recaps.length) {
    lines.push("", "—— 路线记录 ——");
    for (const r of recaps) {
      lines.push(
        `【${r.route.name}】已完成 ${r.completed} / ${r.total} 站${
          r.floor > r.total ? `（历史完成 ${r.floor} 站）` : ""
        }`,
      );
      if (r.completedTitles.length)
        lines.push(`实际完成：${r.completedTitles.join("、")}`);
      if (r.pendingTitles.length)
        lines.push(`仍待完成：${r.pendingTitles.join("、")}`);
      if (r.removed.length) {
        lines.push("已从计划删除：");
        for (const item of r.removed) {
          lines.push(
            `- ${item.title}${item.completed ? "（删除前已实际完成）" : "（未参观，仅删除计划）"}`,
          );
        }
      }
    }
  }
  if (removedRoutes.length) {
    lines.push("", "—— 已删除的路线（参观记录保留） ——");
    for (const r of removedRoutes) {
      lines.push(
        `【${r.routeName}】实际参观：${r.titles.join("、") || "无"}`,
      );
    }
  }
  return lines.join("\n\n");
}
