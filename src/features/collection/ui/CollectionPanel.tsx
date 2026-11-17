import { Heart, Download, ArrowUpRight, Check, X } from "lucide-react";
import type { GalleryDocument } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import {
  recapStats,
  createRecap,
  routeRecaps,
  removedRouteHistory,
} from "../lib/recap";
import { downloadRecap } from "../lib/download";
export function CollectionPanel({
  document,
  onSelect,
  onNote,
  onToggle,
}: {
  document: GalleryDocument;
  onSelect: (id: string) => void;
  onNote: (id: string, text: string) => void;
  onToggle: (id: string) => void;
}) {
  const stats = recapStats(document);
  const routes = routeRecaps(document);
  const deletedRoutes = removedRouteHistory(document);
  return (
    <div className="collection-panel">
      <div className="eyebrow">YOUR PERSONAL GALLERY</div>
      <h2>把共鸣，留在这里。</h2>
      <div className="stats">
        <span>
          <strong>{stats.seen}</strong>已观看
        </span>
        <span>
          <strong>{stats.saved}</strong>已收藏
        </span>
        <span>
          <strong>{Math.floor(stats.seconds / 60)}′</strong>停留时长
        </span>
      </div>
      {(routes.length > 0 || deletedRoutes.length > 0) && (
        <div className="route-recap" data-testid="route-recap">
          <div className="eyebrow">路线回顾 · ROUTE RECAP</div>
          {routes.map((r) => (
            <article className="route-recap-card" key={r.route.id}>
              <strong>{r.route.name}</strong>
              <small>
                已完成 {r.completed} / {r.total} 站
                {r.floor > r.total ? ` · 历史完成 ${r.floor} 站` : ""}
              </small>
              <progress value={r.progress} max="1" />
              {r.completedTitles.length > 0 && (
                <p className="recap-line done">
                  <Check size={12} /> 实际完成：{r.completedTitles.join("、")}
                </p>
              )}
              {r.pendingTitles.length > 0 && (
                <p className="recap-line pending">仍待完成：{r.pendingTitles.join("、")}</p>
              )}
              {r.removed.length > 0 && (
                <div className="recap-removed" data-testid="recap-removed">
                  <p className="recap-line">
                    <X size={12} /> 已从计划删除：
                  </p>
                  {r.removed.map((item, i) => (
                    <small key={i}>
                      {item.title} · {item.completed ? "删除前已实际参观" : "仅删除计划，未参观"}
                    </small>
                  ))}
                </div>
              )}
            </article>
          ))}
          {deletedRoutes.map((r) => (
            <article className="route-recap-card gone" key={r.routeId}>
              <strong>{r.routeName}</strong>
              <small>路线已删除 · 参观记录保留</small>
              <p className="recap-line done">
                <Check size={12} /> 实际参观：{r.titles.join("、") || "无"}
              </p>
            </article>
          ))}
        </div>
      )}
      {document.favorites.length === 0 ? (
        <div className="empty">
          <Heart size={28} />
          <p>遇见喜欢的作品，点亮一颗心。</p>
          <small>你的参观故事，将从这里开始。</small>
        </div>
      ) : (
        document.favorites.map((id) => {
          const a = artworkById(id);
          if (!a) return null;
          return (
            <article className="saved-card" key={id}>
              <button className="saved-title" onClick={() => onSelect(id)}>
                {a.title}
                <ArrowUpRight size={15} />
              </button>
              <small>
                {a.artist} · {a.year}
              </small>
              <textarea
                aria-label={"感想-" + a.title}
                placeholder="写下此刻的感受…"
                value={document.notes[id] || ""}
                onChange={(e) => onNote(id, e.target.value)}
                maxLength={1000}
              />
              <button className="text-button" onClick={() => onToggle(id)}>
                移出收藏
              </button>
            </article>
          );
        })
      )}
      <button
        className="primary full"
        disabled={!stats.saved && !routes.length}
        onClick={() => downloadRecap(createRecap(document))}
      >
        <Download size={16} />
        生成个人参观回顾
      </button>
    </div>
  );
}
