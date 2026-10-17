import React from 'react';
import { PROVIDERS } from '../lib/providers.js';

const MESSAGES = {
  idle: 'Idle',
  transcribing: 'Listening… transcribing Yoruba',
  translating: 'Translating to English…',
  error: 'Error',
};

export default function PipelineStatus({ state, error, demoMode, provider }) {
  const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label ?? provider;

  return (
    <section className="panel">
      <h2 className="panel__title">Pipeline</h2>
      <p className={`pipeline-state pipeline-state--${state}`}>
        {state === 'transcribing' || state === 'translating' ? '◌ ' : ''}
        {MESSAGES[state] ?? state}
      </p>
      {provider && <p className="hint">Provider: <strong>{providerLabel}</strong></p>}
      {demoMode && (
        <p className="hint">
          <strong>Demo mode</strong> — captions are simulated. Add a <strong>free Gemini API
          key</strong> in Settings (aistudio.google.com) for real Yoruba transcription + English
          translation at no cost.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

