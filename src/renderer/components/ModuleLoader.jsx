import React from 'react';

/**
 * Full-screen loader shown while selected modules (and their code/data)
 * are being fetched/initialised before the main workspace appears.
 */
export default function ModuleLoader({ modules = [] }) {
  const labels = {
    captioning: 'Live Captioning & Translation',
    hymns: 'Hymn / Song Display',
    bible: 'Bible Display',
  };
  const list = (modules || []).filter(Boolean);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        background: 'var(--bg, #0e1116)',
        color: 'var(--text, #e6e8ec)',
        zIndex: 9999,
      }}
    >
      <img src="/logo.png" alt="PulpitAI" style={{ width: 72, height: 72 }} />
      <div style={{ fontSize: 20, fontWeight: 600 }}>
        Preparing your workspace…
      </div>
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid rgba(255,255,255,0.15)',
          borderTopColor: 'var(--accent, #4da3ff)',
          borderRadius: '50%',
          animation: 'module-spin 0.9s linear infinite',
        }}
      />
      {list.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, opacity: 0.75, fontSize: 13 }}>
          {list.map((m) => (
            <li key={m} style={{ marginTop: 4 }}>
              ⏳ {labels[m] || m}
            </li>
          ))}
        </ul>
      )}
      <style>{`@keyframes module-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}