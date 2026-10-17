import React, { useEffect, useRef } from 'react';
import TranscriptSegment from './TranscriptSegment.jsx';

// Live transcript of everything said so far. Auto-scrolls unless the user
// has scrolled up to read older lines.
export default function TranscriptPanel({ segments, onClear }) {
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [segments]);

  return (
    <section className="panel panel--transcript">
      <div className="panel__head">
        <h2 className="panel__title">Live Transcript</h2>
        <button className="btn btn--ghost btn--small" onClick={onClear} disabled={!segments.length}>
          Clear
        </button>
      </div>
      <div className="transcript" ref={listRef}>
        {segments.length === 0 && (
          <p className="transcript__empty">
            Press <strong>Start Listening</strong> and preach in Yoruba — captions appear here and
            in your OBS/vMix overlay.
          </p>
        )}
        {segments.map((seg) => (
          <TranscriptSegment key={seg.id} segment={seg} />
        ))}
      </div>
    </section>
  );
}
