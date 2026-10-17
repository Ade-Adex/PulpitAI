// Voice Activity Detection: turn a stream of RMS levels into utterance events.
// An utterance begins when level stays above `threshold`, and ends after
// `silenceMs` of quiet (or forcibly at `maxUtteranceMs` so long sermons
// are still chunked).

export function createUtteranceDetector({ threshold, silenceMs, maxUtteranceMs, onUtterance }) {
  let speaking = false;
  let silenceStartedAt = 0;
  let utteranceStartedAt = 0;

  return function tick(level, now = performance.now()) {
    if (level >= threshold) {
      if (!speaking) {
        speaking = true;
        utteranceStartedAt = now;
      }
      silenceStartedAt = 0;
      return;
    }

    if (!speaking) return;

    if (!silenceStartedAt) silenceStartedAt = now;

    const silentLongEnough = now - silenceStartedAt >= silenceMs;
    const tooLong = now - utteranceStartedAt >= maxUtteranceMs;

    if (silentLongEnough || tooLong) {
      speaking = false;
      silenceStartedAt = 0;
      onUtterance({ startedAt: utteranceStartedAt, endedAt: now });
    }
  };
}
