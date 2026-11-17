export function stopSpeech() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
/**
 * Speak one caption. `onEnd` fires only for the utterance that is still the
 * active one: a cancelled or superseded utterance never reports completion, so
 * a late end event cannot be mistaken for the end of a newer segment.
 */
export function speak(
  text: string,
  rate: number,
  onEnd?: () => void,
): boolean {
  stopSpeech();
  if (!("speechSynthesis" in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = rate;
  let active = true;
  u.onend = () => {
    if (active) onEnd?.();
  };
  u.onerror = () => {
    active = false;
  };
  window.speechSynthesis.speak(u);
  return true;
}
