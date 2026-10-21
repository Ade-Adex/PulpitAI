import React, { useState } from 'react';

/**
 * Splash / module-selection screen — Req #1.
 *
 * The app opens here first (until the user saves a choice). The user ticks
 * ANY combination they want loaded — e.g. transcribing + songs, or just
 * songs — and only those modules initialise. Nothing unselected is loaded,
 * so a "hymns only" user never pays for the captioning pipeline or the
 * (upcoming) Bible module.
 *
 * Modules:
 *   captioning  — Live sermon captioning / translation (existing pipeline)
 *   hymns       — Christ BC hymn browser (EasyWorship-like search & display)
 *   bible       — Upcoming (disabled, shown as "soon")
 */
const MODULES = [
  {
    id: 'captioning',
    label: 'Live Captioning & Translation',
    desc: 'Real-time Yoruba → English sermon captions for OBS / vMix',
    icon: '🎙️',
  },
  {
    id: 'hymns',
    label: 'Hymn / Song Display',
    desc: 'Search and display hymns — EasyWorship-style, light & fast',
    icon: '🎵',
  },
  {
    id: 'bible',
    label: 'Bible Display',
    desc: 'Scripture display — coming soon',
    icon: '📖',
    soon: true,
  },
];

export default function SplashScreen({ initial = [], onStart, onCancel }) {
  const [selected, setSelected] = useState(() =>
    new Set(initial.filter((m) => m !== 'bible')),
  );

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canStart = selected.size > 0;

  return (
    <div className="splash">
      <div className="splash__card">
        <div className="splash__brand">
          <div className="splash__logo">P</div>
          <div className="splash__title">Pulpit<span className="splash__accent">AI</span></div>
          <div className="splash__subtitle">Pick what to load — only that runs.</div>
        </div>

        <div className="splash__modules">
          {MODULES.map((m) => {
            const checked = selected.has(m.id);
            return (
              <label
                key={m.id}
                className={`splash__module ${checked ? 'is-checked' : ''} ${m.soon ? 'is-soon' : ''}`}
              >
                <input
                  type="checkbox"
                  className="splash__check"
                  checked={checked}
                  disabled={!!m.soon}
                  onChange={() => toggle(m.id)}
                />
                <span className="splash__module__icon">{m.icon}</span>
                <div className="splash__module__text">
                  <div className="splash__module__label">
                    {m.label}
                    {m.soon && <span className="splash__soon">soon</span>}
                  </div>
                  <div className="splash__module__desc">{m.desc}</div>
                </div>
                <span className="splash__module__tick">{checked ? '✓' : ''}</span>
              </label>
            );
          })}
        </div>

        <button
          className="btn btn--primary splash__start"
          disabled={!canStart}
          onClick={() => onStart([...selected])}
        >
          {canStart ? `Load ${selected.size} module${selected.size > 1 ? 's' : ''} →` : 'Tick at least one module'}
        </button>

        {onCancel && (
          <button
            type="button"
            className="btn btn--ghost splash__cancel"
            onClick={onCancel}
          >
            ← Back to previous
          </button>
        )}

        <div className="splash__footer">
          Small • fast • built for the church
        </div>
      </div>
    </div>
  );
}
