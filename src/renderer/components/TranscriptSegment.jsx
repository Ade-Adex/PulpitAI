import React from 'react';

function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TranscriptSegment({ segment }) {
  return (
    <article className="segment">
      <div className="segment__meta">
        <span>{formatTime(segment.at)}</span>
        {segment.demo && <span className="segment__demo-tag">DEMO</span>}
        <span>{(segment.latencyMs / 1000).toFixed(1)}s</span>
      </div>
      <p className="segment__yoruba">{segment.yoruba}</p>
      <p className="segment__english">{segment.english}</p>
    </article>
  );
}

