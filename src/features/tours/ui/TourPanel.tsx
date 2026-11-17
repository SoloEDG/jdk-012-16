import { useRef, useState } from "react";
import {
  Route as RouteIcon,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Pause,
  Play,
  X,
  Plus,
  GripVertical,
  Undo2,
  Save,
  RotateCcw,
  Copy,
  Trash2,
  Check,
} from "lucide-react";
import { routes as curatedRoutes, artworks, artworkById } from "../../../shared/catalog";
import type {
  PersonalRoute,
  StopFact,
  TourState,
} from "../../../shared/types";
import { occurrenceCounts, routeCompletion } from "../lib/routeProgress";

const PHASE_LABEL: Record<string, string> = {
  walking: "正在前往",
  listening: "正在讲解",
  paused: "导览已暂停",
  done: "已完成",
};

export function TourPanel({
  state,
  routes,
  facts,
  onStart,
  onPause,
  onResume,
  onStop,
  onNext,
  onReorder,
  onRemove,
  onAdd,
  onUndo,
  onSave,
  onRevert,
  onCopy,
  onDeleteRoute,
}: {
  state: TourState;
  routes: PersonalRoute[];
  facts: StopFact[];
  onStart: (id: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (occurrenceId: string) => void;
  onAdd: (artworkId: string, at?: number) => void;
  onUndo: () => void;
  onSave: () => void;
  onRevert: () => void;
  onCopy: (routeId: string) => void;
  onDeleteRoute: (routeId: string) => void;
}) {
  const route = state.route;
  const editing = !!route && state.phase !== "idle";
  return (
    <section className="tour-panel">
      <div className="section-title">
        <RouteIcon size={16} />
        <span>主题导览</span>
        <small>CURATED JOURNEYS</small>
      </div>
      {editing ? (
        <ActiveTour
          state={state}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          onNext={onNext}
          onReorder={onReorder}
          onRemove={onRemove}
          onAdd={onAdd}
          onUndo={onUndo}
          onSave={onSave}
          onRevert={onRevert}
        />
      ) : (
        <>
          {routes.length > 0 && (
            <div className="personal-routes" data-testid="personal-routes">
              <div className="eyebrow">我的路线 · MY ROUTES</div>
              {routes.map((r) => {
                const c = routeCompletion(r, facts);
                const label = r.stops.length ? "" : " · 空路线";
                return (
                  <div className="personal-route-card" key={r.id}>
                    <button
                      className="personal-route-open"
                      onClick={() => onStart(r.id)}
                    >
                      <strong>{r.name}</strong>
                      <small>
                        {r.stops.length} 站 · 已完成 {c.completed} / {r.stops.length}
                        {c.floor > r.stops.length
                          ? ` · 历史完成 ${c.floor}`
                          : ""}
                        {label}
                      </small>
                      <span>{Math.round(c.progress * 100)}%</span>
                    </button>
                    <div className="personal-route-actions">
                      <button
                        aria-label={"开始路线 " + r.name}
                        onClick={() => onStart(r.id)}
                      >
                        <Play size={12} />
                        开始
                      </button>
                      <button
                        aria-label={"复制路线 " + r.name}
                        onClick={() => onCopy(r.id)}
                      >
                        <Copy size={12} />
                        复制
                      </button>
                      <button
                        aria-label={"删除路线 " + r.name}
                        onClick={() => onDeleteRoute(r.id)}
                      >
                        <Trash2 size={12} />
                        删除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {curatedRoutes.map((r, i) => (
            <button
              className={"route-card route-" + i}
              key={r.id}
              onClick={() => onStart(r.id)}
            >
              <span>
                JOURNEY 0{i + 1}
                <span>约 {i ? 3 : 2} 分钟 · {r.stops.length} 件作品</span>
              </span>
              <h3>
                {r.name}
                <ArrowUpRightIcon />
              </h3>
              <p>{r.subtitle}</p>
            </button>
          ))}
          <p className="tour-hint">
            路线开始后仍可增删与重排站点；把同一件作品再次加入，就是一次新的重访。
          </p>
        </>
      )}
    </section>
  );
}

function ActiveTour({
  state,
  onPause,
  onResume,
  onStop,
  onNext,
  onReorder,
  onRemove,
  onAdd,
  onUndo,
  onSave,
  onRevert,
}: {
  state: TourState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onNext: () => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (occurrenceId: string) => void;
  onAdd: (artworkId: string, at?: number) => void;
  onUndo: () => void;
  onSave: () => void;
  onRevert: () => void;
}) {
  const route = state.route!;
  const stops = route.stops;
  const completed = new Set(state.completed);
  const counts = occurrenceCounts(stops);
  const activeId = state.activeStop?.occurrenceId ?? null;
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [choice, setChoice] = useState(artworks[0]?.id ?? "");

  const drop = (index: number) => {
    if (dragFrom.current !== null && dragFrom.current !== index) {
      onReorder(dragFrom.current, index);
    }
    dragFrom.current = null;
    setDragOver(null);
  };

  const add = () => {
    if (!choice) return;
    const at = state.step >= 0 ? state.step + 1 : undefined;
    // Re-adding an artwork is allowed on purpose: it becomes a revisit stop.
    onAdd(choice, at);
  };

  return (
    <div className="current-tour" data-testid="active-tour">
      <span className="eyebrow">
        正在探索 ·{" "}
        {state.phase === "done"
          ? "已完成"
          : state.detached
            ? `当前段（${stops.length} 站的路线外）`
            : `${Math.max(state.step, 0) + 1} / ${stops.length}`}
      </span>
      <div className="current-tour-heading">
        <h3>{route.name}</h3>
        <span className={state.dirty ? "save-state dirty" : "save-state"}>
          {route.personalRouteId ? "个人版本" : "展馆模板"}
          {state.dirty ? " · 未保存" : ""}
        </span>
      </div>
      <progress value={state.progress} max="1" />
      <div className="completion-split" data-testid="completion-split">
        <span>
          已完成 <strong>{state.completedCount}</strong>
        </span>
        <span>
          待完成 <strong>{state.pendingCount}</strong>
        </span>
        {state.historicalCount > state.completedCount && (
          <span className="historical">
            另有 {state.historicalCount - state.completedCount}{" "}
            项历史完成已随站点移出路线（不会回退）
          </span>
        )}
      </div>
      <p className="tour-status" role="status" aria-live="polite">
        {state.notice ||
          (state.phase === "done"
            ? "这段旅程已完成，收藏你的所见。"
            : `${PHASE_LABEL[state.phase] || ""} · ${
                state.activeStop
                  ? artworkById(state.activeStop.artworkId)?.title
                  : "无当前站"
              }`)}
      </p>
      {state.detached && (
        <p className="detached-note" data-testid="detached-note">
          当前站已移出路线：这一段的讲解 / 路程仍会完成，结束后按新顺序继续。
        </p>
      )}
      <div className="tour-controls">
        {state.phase !== "done" && (
          <>
            <button onClick={state.phase === "paused" ? onResume : onPause}>
              {state.phase === "paused" ? (
                <Play size={14} />
              ) : (
                <Pause size={14} />
              )}
              {state.phase === "paused" ? "继续" : "暂停"}
            </button>
            <button onClick={onNext}>
              下一站
              <ArrowRight size={14} />
            </button>
          </>
        )}
        <button aria-label="结束导览" onClick={onStop}>
          <X size={14} />
        </button>
      </div>

      <div className="tour-editor" data-testid="tour-editor">
        <div className="tour-editor-head">
          <span>编辑路线</span>
          <div className="edit-actions">
            <button
              aria-label="撤销上一步"
              disabled={!state.canUndo}
              onClick={onUndo}
            >
              <Undo2 size={12} />
              撤销{state.undoLabel ? `：${state.undoLabel}` : ""}
            </button>
            <button aria-label="保存个人版本" onClick={onSave}>
              <Save size={12} />
              保存
            </button>
            <button
              aria-label="恢复上次保存的版本"
              disabled={!state.dirty}
              onClick={onRevert}
            >
              <RotateCcw size={12} />
              恢复
            </button>
          </div>
        </div>
        <ol className="stop-list">
          {stops.map((stop, index) => {
            const artwork = artworkById(stop.artworkId);
            const isDone = completed.has(stop.occurrenceId);
            const isActive = activeId === stop.occurrenceId;
            return (
              <li
                key={stop.occurrenceId}
                draggable
                data-testid={"stop-" + stop.occurrenceId}
                data-occurrence={stop.occurrenceId}
                data-artwork={stop.artworkId}
                data-completed={isDone ? "true" : "false"}
                className={
                  "stop-row" +
                  (isActive ? " active" : "") +
                  (dragOver === index ? " drag-over" : "")
                }
                onDragStart={() => {
                  dragFrom.current = index;
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(index);
                }}
                onDragLeave={() => setDragOver((d) => (d === index ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  drop(index);
                }}
                onDragEnd={() => {
                  dragFrom.current = null;
                  setDragOver(null);
                }}
              >
                <span className="stop-grip" aria-hidden="true">
                  <GripVertical size={13} />
                </span>
                <span className="stop-index">{index + 1}</span>
                <span className="stop-body">
                  <strong>
                    {artwork?.title}
                    {(counts.get(stop.artworkId) || 0) > 1 && (
                      <em className="revisit">重访</em>
                    )}
                  </strong>
                  <small>{isDone ? "已完成" : "待完成"}</small>
                </span>
                {isDone && (
                  <span className="stop-done" aria-label="已完成">
                    <Check size={12} />
                  </span>
                )}
                <span className="stop-tools">
                  <button
                    aria-label={`上移第 ${index + 1} 站`}
                    disabled={index === 0}
                    onClick={() => onReorder(index, index - 1)}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label={`下移第 ${index + 1} 站`}
                    disabled={index === stops.length - 1}
                    onClick={() => onReorder(index, index + 1)}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    aria-label={`删除第 ${index + 1} 站`}
                    onClick={() => onRemove(stop.occurrenceId)}
                  >
                    <X size={12} />
                  </button>
                </span>
              </li>
            );
          })}
        </ol>
        <div className="stop-add">
          <select
            aria-label="选择要加入路线的作品"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {artworks.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <button aria-label="添加站点" onClick={add} disabled={!choice}>
            <Plus size={12} />
            添加
          </button>
        </div>
        <p className="tour-hint">
          已完成是事实，不会因排序或删除回退；新加入的站（即使作品相同）仍待完成。
        </p>
      </div>
    </div>
  );
}

function ArrowUpRightIcon() {
  return <span className="round-arrow">↗</span>;
}
