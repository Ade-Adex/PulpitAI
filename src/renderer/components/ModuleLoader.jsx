import React from 'react';

/**
 * Full-screen loader shown while selected modules (and their code/data)
 * are being fetched/initialised before the main workspace appears.
 *
 * Professional, branded loading experience with a progress indicator and a
 * per-module status list.
 */
const MODULE_LABELS = {
  captioning: 'Live Captioning & Translation',
  hymns: 'Hymn / Song Display',
  bible: 'Bible Display',
};

export default function ModuleLoader({ modules = [], progress }) {
  const list = (modules || []).filter(Boolean);
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: 'linear-gradient(160deg, #0e1116 0%, #161a22 100%)',
        color: 'var(--text, #e6e8ec)',
        zIndex: 9999,
        fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <img
          src="/logo.png"
          alt="PulpitAI"
          style={{ width: 88, height: 88, borderRadius: 18, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
        />
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 0.3 }}>PulpitAI</div>
        <div style={{ fontSize: 14, opacity: 0.7 }}>Preparing your workspace…</div>
      </div>

      {pct !== null && (
        <div style={{ width: 260, height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'var(--accent, #4da3ff)',
              borderRadius: 999,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      )}

      {list.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            padding: 12,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 260,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
          }}
        >
          {list.map((m) => (
            <li
              key={m}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 13,
                opacity: 0.9,
                padding: '4px 6px',
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: '2px solid rgba(255,255,255,0.2)',
                  borderTopColor: 'var(--accent, #4da3ff)',
                  borderRadius: '50%',
                  animation: 'module-spin 0.9s linear infinite',
                  flexShrink: 0,
                }}
              />
              {MODULE_LABELS[m] || m}
            </li>
          ))}
        </ul>
      )}

      <style>{`@keyframes module-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}