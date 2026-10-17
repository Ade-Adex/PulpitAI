import React, { useEffect, useRef } from 'react';
import TranscriptSegment from './TranscriptSegment.jsx';

// Live transcript of everything said so far. Auto-scrolls unless the user
// has scrolled up to read older lines.
export default function TranscriptPanel({ segments, onClear, settings }) {
  const listRef = useRef(null);
  const userScrolledRef = useRef(false);

  const fontSize = settings?.transcriptFontSize ?? 14;
  const showTimestamps = settings?.showTimestamps ?? true;
  const showLatency = settings?.showLatency ?? true;
  const autoScroll = settings?.autoScroll ?? true;

  useEffect(() => {
    const el = listRef.current;
    if (!el || !autoScroll) return;
    // Don't auto-scroll if the user has manually scrolled up to read.
    if (userScrolledRef.current) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [segments, autoScroll]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const el = listRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    userScrolledRef.current = !nearBottom;
  };

  return (
    <section className="panel panel--transcript">
      <div className="panel__head">
        <h2 className="panel__title">Live Transcript</h2>
        <button className="btn btn--ghost btn--small" onClick={onClear} disabled={!segments.length}>
          Clear
        </button>
      </div>
      <div className="transcript" ref={listRef} onScroll={handleScroll} style={{ fontSize: `${fontSize}px` }}>
        {segments.length === 0 && (
          <p className="transcript__empty">
            Press <strong>Start Listening</strong> and preach in Yoruba — captions appear here and
            in your OBS/vMix overlay.
          </p>
        )}
        {segments.map((seg) => (
          <TranscriptSegment
            key={seg.id}
            segment={seg}
            showTimestamps={showTimestamps}
            showLatency={showLatency}
          />
        ))}
      </div>
    </section>
  );
}
