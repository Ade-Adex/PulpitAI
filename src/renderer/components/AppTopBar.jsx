import React from 'react';
import { MdExtension, MdVideocam, MdLink, MdCellTower, MdSettings } from 'react-icons/md';
import { MdMic, MdMusicNote, MdMenuBook } from 'react-icons/md';

const MODULE_LABELS = {
  captioning: 'Captioning',
  hymns: 'Hymns',
  bible: 'Bible',
};

function moduleIcon(id) {
  if (id === 'captioning') return <MdMic size={14} />;
  if (id === 'hymns') return <MdMusicNote size={14} />;
  return <MdMenuBook size={14} />;
}

export default function AppTopBar({
  enabled,
  singleModule,
  activeTab,
  onTabChange,
  changeModules,
  hasCaptioning,
  listening,
  captureStatus,
  onToggleCapture,
  onOpenSettings,
}) {
  return (
    <header className="appbar">
      <div className="appbar__brand">
        <img className="appbar__logo" src="./logo.png" alt="PulpitAI logo" />
        <div>
          <h1 className="appbar__title">
            Pulpit<span className="appbar__accent">AI</span>
          </h1>
          <span className="appbar__tag">Pro Presenter v3.0</span>
        </div>
      </div>
      <div className="appbar__spacer"></div>
      <nav className="appbar__tabs" aria-label="Modules">
        {!singleModule && (
          <>
            {enabled?.map((m) => (
              <button
                key={m}
                className={`appbar__tab ${activeTab === m ? 'is-active' : ''}`}
                onClick={() => onTabChange(m)}
              >
                <span className="appbar__tab__icon">{moduleIcon(m)}</span>
                <span className="appbar__tab__label">{MODULE_LABELS[m] ?? m}</span>
              </button>
            ))}
          </>
        )}
        {singleModule && (
          <button className="appbar__tab is-active" onClick={changeModules} title="Change modules">
            <span className="appbar__tab__icon"><MdExtension size={14} /></span>
            <span className="appbar__tab__label">Modules</span>
          </button>
        )}
      </nav>
      <div className="appbar__controls">
        {hasCaptioning && (
          <button
            className={`btn btn--small ${listening ? 'btn--danger' : 'btn--primary'}`}
            onClick={onToggleCapture}
            disabled={captureStatus === 'starting'}
            title={listening ? 'Stop capturing' : 'Start capturing'}
          >
            {listening ? 'Stop' : 'Start'}
          </button>
        )}
        <span className="obs-source">
          <span className="obs-source__icon"><MdVideocam size={14} /></span> OBS Browser Source
        </span>
        <button className="btn btn--icon" title="Copy source URL"><MdLink size={14} /></button>
        <span className="broadcast-badge">
          <span className="broadcast-badge__dot"></span> BROADCAST READY
        </span>
        <button className="btn btn--live" title="Go live">
          <span className="btn--live__icon"><MdCellTower size={14} /></span> LIVE ON AIR
        </button>
        <button className="btn btn--icon btn--small" onClick={onOpenSettings} title="Settings">
          <MdSettings size={14} />
        </button>
      </div>
    </header>
  );
}
