import React from 'react';
import { MdSettings, MdExtension } from 'react-icons/md';

const LABELS = {
  idle: 'Start Listening',
  starting: 'Starting...',
  listening: 'Stop Listening',
  error: 'Retry',
};

export default function ControlBar({ listening, status, onToggle, onOpenSettings, onReselectModules }) {
  return (
    <div className="controlbar">
      <button
        className={`btn btn--primary ${listening ? 'btn--danger' : ''}`}
        onClick={onToggle}
        disabled={status === 'starting'}
      >
        {LABELS[status] ?? 'Start Listening'}
      </button>
      <button className="btn btn--ghost" onClick={onOpenSettings}>
        <MdSettings size={14} /> Settings
      </button>
      {onReselectModules && (
        <button className="btn btn--ghost" onClick={onReselectModules}>
          <MdExtension size={14} /> Reselect modules
        </button>
      )}
    </div>
  );
}
