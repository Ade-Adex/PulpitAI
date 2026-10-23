import React, { useCallback, useEffect, useState } from 'react';
import { MdClose, MdFullscreen, MdFullscreenExit } from 'react-icons/md';
import { api } from '../lib/api.js';

/**
 * HymnDisplay — lower third or full-screen hymn display.
 *
 * Renders the currently selected hymn's lyrics large enough to be captured
 * by OBS/vMix (window capture or browser source) or shown on a projector.
 *
 * Modes:
 *   lower-third — compact band at the bottom of the screen
 *   fullscreen   — fills the entire screen
 *
 * Styling:
 *   backgroundColor / backgroundImage — slide backing
 *   textColor — lyric text colour
 *   fontSize — verse text size
 *
 * This component is rendered inside the main app window (so it can be
 * captured by OBS via window capture) and can also be pushed to a
 * separate BrowserWindow via api.openDisplayWindow() for PC-to-PC use.
 */
export default function HymnDisplay({ hymn, mode, textColor, backgroundColor, backgroundImage, fontSize, showVerseLabel, onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      const el = document.documentElement;
      if (el.requestFullscreen) el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
      else if (el.msRequestFullscreen) el.msRequestFullscreen();
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    }
  }, [isFullscreen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('msfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
      document.removeEventListener('msfullscreenchange', onChange);
    };
  }, []);

  const bgStyle = backgroundImage
    ? { backgroundImage: `url(${backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor }
    : { backgroundColor };

  if (!hymn) return null;

  const verses =
    Array.isArray(hymn.verses) && hymn.verses.length > 0
      ? hymn.verses
      : hymn.lyrics
        ? String(hymn.lyrics).split(/\n\s*\n/).filter(Boolean)
        : [];

  const isLowerThird = mode === 'lower' || mode === 'lower-third';

  return (
    <div
      className={`hymn__display ${isLowerThird ? 'hymn__display--lower-third' : 'hymn__display--fullscreen'} ${isFullscreen ? 'hymn__display--fullscreen-api' : ''}`}
      style={{
        ...bgStyle,
        color: textColor,
        fontSize: `${fontSize}px`,
      }}
    >
      {isLowerThird && (
        <div className="hymn__display__lower-third__bar" />
      )}
      <div className="hymn__display__content">
        {onClose && (
          <button
            className="hymn__display__close"
            aria-label="Close display"
            onClick={onClose}
          >
            <MdClose size={18} />
          </button>
        )}
        {!isLowerThird && (
          <button
            className="hymn__display__fullscreen-btn"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <><MdFullscreenExit size={14} /> Exit Fullscreen</> : <><MdFullscreen size={14} /> Fullscreen</>}
          </button>
        )}
        <div className="hymn__display__header">
          {hymn.number && <div className="hymn__display__number">{hymn.number}</div>}
          <h1 className="hymn__display__title">{hymn.title ?? 'Untitled'}</h1>
          {hymn.author && showVerseLabel && (
            <div className="hymn__display__author">by {hymn.author}</div>
          )}
        </div>
        <div className="hymn__display__body">
          {verses.length === 0 ? (
            <div className="hymn__display__none">No verse text available.</div>
          ) : (
            verses.map((v, i) => {
              const lines = Array.isArray(v) ? v : String(v).split('\n').filter(Boolean);
              return (
                <div key={i} className="hymn__display__verse">
                  {lines.length > 1 && showVerseLabel && (
                    <div className="hymn__display__verse__label">Verse {i + 1}</div>
                  )}
                  {lines.map((line, j) => (
                    <div key={j} className="hymn__display__verse__line">{line}</div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
