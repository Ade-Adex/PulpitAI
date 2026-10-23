import React from 'react';
import { MdFiberManualRecord, MdKeyboardArrowUp } from 'react-icons/md';

export default function AppHeader({ listening, alwaysOnTop }) {
  return (
    <header className="header">
      <img className="header__logo" src="./logo.png" alt="PulpitAI logo" />
      <h1 className="header__title">
        Pulpit<span className="header__accent">AI</span>
      </h1>
      <p className="header__subtitle">Yoruba &rarr; English live sermon translator</p>
      <span className={`header__badge ${listening ? 'header__badge--live' : ''}`}>
        {listening ? <><MdFiberManualRecord size={10} /> LIVE</> : <><MdFiberManualRecord size={10} /> standby</>}
      </span>
      {alwaysOnTop && (
        <span className="header__badge header__badge--ontop"><MdKeyboardArrowUp size={12} /> ALWAYS ON TOP</span>
      )}
    </header>
  );
}
