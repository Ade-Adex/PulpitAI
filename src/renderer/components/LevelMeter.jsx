import React from 'react';

// Simple RMS level bar; the threshold line shows where VAD triggers.
export default function LevelMeter({ level, threshold = 0.018 }) {
  const pct = Math.min(100, level * 900); // scale RMS to a visible bar
  const thresholdPct = Math.min(100, threshold * 900);

  return (
    <div className="level-meter" title="Input level">
      <div className="level-meter__track">
        <div
          className={`level-meter__fill ${level >= threshold ? 'level-meter__fill--hot' : ''}`}
          style={{ width: `${pct}%` }}
        />
        <div className="level-meter__threshold" style={{ left: `${thresholdPct}%` }} />
      </div>
    </div>
  );
}
