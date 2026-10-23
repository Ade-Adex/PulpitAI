import React from 'react';
import { MdFiberManualRecord } from 'react-icons/md';

function formatTime(at) {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function TranscriptSegment({ segment, showTimestamps = true, showLatency = true }) {
  return (
    <article className={`segment${segment.interim ? ' segment--interim' : ''}`}>
      <div className="segment__meta">
        {showTimestamps && <span>{formatTime(segment.at)}</span>}
        {segment.interim && <span className="segment__live-tag"><MdFiberManualRecord size={8} /> typing</span>}
        {segment.demo && <span className="segment__demo-tag">DEMO</span>}
        {segment.provider && <span className="segment__provider">{segment.provider}</span>}
        {showLatency && segment.latencyMs != null && <span>{(segment.latencyMs / 1000).toFixed(1)}s</span>}
      </div>
      <p className="segment__yoruba">{segment.yoruba}</p>
      <p className="segment__english">{segment.english}</p>
    </article>
  );
}

