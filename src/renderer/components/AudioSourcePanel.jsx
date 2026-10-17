import React from 'react';
import LevelMeter from './LevelMeter.jsx';

const SOURCES = [
  { value: 'mic', label: '🎤 Microphone' },
  { value: 'system', label: '🖥 System audio' },
  { value: 'both', label: '🎤 + 🖥 Mixed' },
];

export default function AudioSourcePanel({
  source,
  deviceId,
  devices,
  level,
  error,
  onSourceChange,
  onDeviceChange,
  onRefreshDevices,
}) {
  return (
    <section className="panel">
      <h2 className="panel__title">Audio Source</h2>

      <div className="source-options">
        {SOURCES.map((opt) => (
          <label key={opt.value} className="source-option">
            <input
              type="radio"
              name="source"
              value={opt.value}
              checked={source === opt.value}
              onChange={() => onSourceChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {source !== 'system' && (
        <div className="device-row">
          <select
            className="select"
            value={deviceId}
            onChange={(e) => onDeviceChange(e.target.value)}
          >
            <option value="">Default microphone</option>
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
          <button className="btn btn--ghost btn--small" onClick={onRefreshDevices}>
            ↻
          </button>
        </div>
      )}

      <LevelMeter level={level} />

      {error && <p className="error-text">{error}</p>}
    </section>
  );
}
