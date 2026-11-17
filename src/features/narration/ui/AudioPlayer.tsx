import { Play, Pause, Headphones } from "lucide-react";
import type { AudioState, TourState } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import { formatTime } from "../lib/timeline";

/**
 * Which stop the audio belongs to, if any. The player states this explicitly
 * so a late narration end is never mistaken for the segment on screen.
 */
function ownership(state: AudioState, tour: TourState | undefined) {
  if (!state.artworkId) return { kind: "none" as const, label: "" };
  const active = tour?.activeStop;
  if (
    active &&
    state.segmentId === active.occurrenceId &&
    state.token === tour?.token
  ) {
    const index = tour?.route
      ? tour.route.stops.findIndex(
          (s) => s.occurrenceId === active.occurrenceId,
        )
      : -1;
    return {
      kind: "tour" as const,
      label: `主题导览 · 第 ${index + 1} 站`,
    };
  }
  if (tour && tour.phase !== "idle" && tour.phase !== "done") {
    return {
      kind: "stale" as const,
      label: "自由收听 · 不计入当前导览",
    };
  }
  return { kind: "free" as const, label: "自由收听" };
}

export function AudioPlayer({
  state,
  caption,
  supported,
  tour,
  onToggle,
  onSeek,
  onRate,
}: {
  state: AudioState;
  caption: string;
  supported: boolean;
  tour?: TourState;
  onToggle: () => void;
  onSeek: (n: number) => void;
  onRate: (n: number) => void;
}) {
  const a = artworkById(state.artworkId);
  const owner = ownership(state, tour);
  return (
    <div className="audio-player">
      <div className="audio-icon">
        <Headphones size={20} />
      </div>
      <div className="audio-title">
        <small>语音讲解 · AUDIO GUIDE</small>
        <strong>{a?.title || "让艺术，有声可循"}</strong>
        {owner.kind !== "none" && (
          <em
            className={"audio-owner owner-" + owner.kind}
            data-testid="audio-owner"
          >
            {owner.label}
          </em>
        )}
      </div>
      <button
        aria-label={state.playing ? "暂停讲解" : "播放讲解"}
        className="play-button"
        onClick={onToggle}
        disabled={!a}
      >
        {state.playing ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <span className="time">{formatTime(state.elapsed)}</span>
      <input
        aria-label="讲解进度"
        type="range"
        min="0"
        max={a?.duration || 1}
        step=".1"
        value={state.elapsed}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className="time">{formatTime(a?.duration || 0)}</span>
      <select
        aria-label="讲解速度"
        value={state.rate}
        onChange={(e) => onRate(Number(e.target.value))}
      >
        <option value="1">1.0×</option>
        <option value="1.25">1.25×</option>
        <option value="1.5">1.5×</option>
      </select>
      <div className="caption">
        {!supported
          ? "设备不支持语音，请阅读字幕"
          : caption || "选择一件作品，听见它背后的故事"}
      </div>
    </div>
  );
}
