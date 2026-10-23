import React from 'react';
import { MdAutorenew, MdWarning } from 'react-icons/md';
import { PROVIDERS } from '../lib/providers.js';

const MESSAGES = {
  idle: 'Idle',
  transcribing: 'Listening… transcribing Yoruba',
  translating: 'Translating to English…',
  error: 'Error',
  warning: 'Provider fallback',
};

export default function PipelineStatus({ state, error, warning, demoMode, provider }) {
  const providerLabel = PROVIDERS.find((p) => p.value === provider)?.label ?? provider;

  return (
    <section className="panel">
      <h2 className="panel__title">Pipeline</h2>
      <p className={`pipeline-state pipeline-state--${state}`}>
        {state === 'transcribing' || state === 'translating' ? <MdAutorenew size={12} /> : null}{' '}
        {MESSAGES[state] ?? state}
      </p>
      {provider && <p className="hint">Provider: <strong>{providerLabel}</strong></p>}
      {demoMode && (
        <p className="hint">
          <strong>Demo mode</strong> — captions are simulated. Add a <strong>Gemini</strong> or{' '}
          <strong>GroQ API key</strong> in Settings (aistudio.google.com or console.groq.com) for
          real Yoruba transcription + English translation.
        </p>
      )}
      {warning && <p className="error-text error-text--warn"><MdWarning size={12} /> {warning}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

