import React from 'react';

export default function AppHeader({ listening, alwaysOnTop }) {
  return (
    <header className="header">
      <h1 className="header__title">
        Pulpit<span className="header__accent">AI</span>
      </h1>
      <p className="header__subtitle">Yoruba &rarr; English live sermon translator</p>
      <span className={`header__badge ${listening ? 'header__badge--live' : ''}`}>
        {listening ? '● LIVE' : '○ standby'}
      </span>
      {alwaysOnTop && (
        <span className="header__badge header__badge--ontop">⇧ ALWAYS ON TOP</span>
      )}
    </header>
  );
}
