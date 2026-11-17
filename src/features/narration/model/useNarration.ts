import { useState, useEffect, useRef } from "react";
import type { AudioState, NarrationEnd } from "../../../shared/types";
import { artworkById } from "../../../shared/catalog";
import { captionAt } from "../lib/timeline";
import { createId } from "../../../shared/id";
import { speak, stopSpeech } from "../lib/speech";

/** Identity of the tour segment that owns the audio, when there is one. */
export type AudioOwner = {
  segmentId: string;
  token: number;
};

export function useNarration(onEnd: (event: NarrationEnd) => void) {
  const [state, setState] = useState<AudioState>({
    artworkId: null,
    elapsed: 0,
    playing: false,
    rate: 1,
    segmentId: null,
    token: 0,
  });
  const callback = useRef(onEnd);
  callback.current = onEnd;
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!state.playing) return;
    let previous = performance.now();
    const t = setInterval(() => {
      const now = performance.now();
      const delta = (now - previous) / 1000;
      previous = now;
      setState((s) => ({ ...s, elapsed: s.elapsed + delta * s.rate }));
    }, 150);
    return () => clearInterval(t);
  }, [state.playing]);

  const a = artworkById(state.artworkId);
  const caption = a ? captionAt(a, state.elapsed) : "";

  useEffect(() => {
    if (state.playing && caption) setSupported(speak(caption, state.rate));
    else stopSpeech();
    return stopSpeech;
  }, [caption, state.playing, state.rate]);

  useEffect(() => {
    if (!a || !state.playing || state.elapsed < a.duration) return;
    const ended = {
      artworkId: a.id,
      segmentId: state.segmentId,
      token: state.token,
    };
    setState((s) => ({ ...s, playing: false, elapsed: a.duration }));
    // The end event is always tagged with the segment it actually finished.
    // The tour compares that tag with its own running segment, so finishing a
    // replaced or superseded segment can never be credited elsewhere.
    callback.current(ended);
  }, [state.elapsed, state.playing, a]);

  return {
    state,
    caption,
    supported,
    play: (id: string, owner?: AudioOwner) => {
      setState((s) => {
        const sameSegment =
          !!owner &&
          s.artworkId === id &&
          s.segmentId === owner.segmentId &&
          s.token === owner.token;
        const duration = artworkById(id)?.duration || 0;
        return {
          ...s,
          artworkId: id,
          segmentId: owner?.segmentId ?? createId("audio"),
          token: owner?.token ?? 0,
          elapsed: sameSegment && s.elapsed < duration ? s.elapsed : 0,
          playing: true,
        };
      });
    },
    pause: () => setState((s) => ({ ...s, playing: false })),
    toggle: () => {
      if (!state.artworkId) return;
      const duration = artworkById(state.artworkId)?.duration || 0;
      setState((s) => ({
        ...s,
        // Resuming keeps the segment identity; replaying a finished narration
        // starts from the beginning but still belongs to the same stop.
        elapsed: !s.playing && s.elapsed >= duration ? 0 : s.elapsed,
        playing: !s.playing,
      }));
    },
    seek: (elapsed: number) => setState((s) => ({ ...s, elapsed })),
    rate: (rate: number) => setState((s) => ({ ...s, rate })),
  };
}
