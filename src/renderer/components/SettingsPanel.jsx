import React, { useState } from 'react';
import { PROVIDERS } from '../lib/providers.js';

// Modal settings editor. Local form state, saves on close.
export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState(settings);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };
  const setNumber = (key) => (e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }));

  const save = async () => {
    await onSave({
      ...form,
      captionFontSize: Number(form.captionFontSize),
      captionIdleSeconds: Number(form.captionIdleSeconds),
      maxCaptions: Number(form.maxCaptions),
      overlayPort: Number(form.overlayPort),
      vadThreshold: Number(form.vadThreshold),
      vadSilenceMs: Number(form.vadSilenceMs),
      maxUtteranceMs: Number(form.maxUtteranceMs),
      transcriptFontSize: Number(form.transcriptFontSize),
      alwaysOnTop: Boolean(form.alwaysOnTop),
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="panel__title">Settings</h2>

        <label className="field">
          <span>Translation provider</span>
          <select value={form.provider} onChange={set('provider')}>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <small>Auto = first configured key wins (OpenAI, Gemini, then GroQ — else Demo).</small>
        </label>

        <fieldset className="fieldset">
          <legend>Google Gemini</legend>
          <label className="field">
            <span>Gemini API key</span>
            <input
              type="password"
              value={form.geminiApiKey}
              onChange={set('geminiApiKey')}
              placeholder="AIza..."
              autoComplete="off"
            />
            <small>
              Create a key at <strong>aistudio.google.com</strong> → <em>Get API key</em>. Quota and
              plan/billing limits belong to the key&apos;s project.
            </small>
          </label>
          <label className="field">
            <span>Gemini model</span>
            <input type="text" value={form.geminiModel} onChange={set('geminiModel')} />
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>GroQ — free tier</legend>
          <label className="field">
            <span>GroQ API key</span>
            <input
              type="password"
              value={form.groqApiKey}
              onChange={set('groqApiKey')}
              placeholder="gsk_..."
              autoComplete="off"
            />
            <small>
              Free key at <strong>console.groq.com</strong> → <em>API Keys</em>. Whisper transcribes
              Yoruba; Llama translates to English.
            </small>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Transcription model</span>
              <input type="text" value={form.groqSttModel} onChange={set('groqSttModel')} />
            </label>
            <label className="field">
              <span>Translation model</span>
              <input type="text" value={form.groqChatModel} onChange={set('groqChatModel')} />
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>OpenAI — paid</legend>
          <label className="field">
            <span>OpenAI API key</span>
            <input
              type="password"
              value={form.apiKey}
              onChange={set('apiKey')}
              placeholder="sk-..."
              autoComplete="off"
            />
            <small>Stored locally in the app data folder. Used for Whisper + translation.</small>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Whisper model</span>
              <select value={form.sttModel} onChange={set('sttModel')}>
                <option value="whisper-1">whisper-1 (recommended)</option>
              </select>
            </label>
            <label className="field">
              <span>Translator model</span>
              <select value={form.translatorModel} onChange={set('translatorModel')}>
                <option value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</option>
                <option value="gpt-4o">gpt-4o (higher quality)</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Overlay captions</legend>
          <label className="field field--inline">
            <input type="checkbox" checked={form.showYorubaLine} onChange={set('showYorubaLine')} />
            Show Yoruba line above English
          </label>
          <div className="field-row">
            <label className="field">
              <span>Position</span>
              <select value={form.captionPosition} onChange={set('captionPosition')}>
                <option value="bottom">Bottom</option>
                <option value="top">Top</option>
              </select>
            </label>
            <label className="field">
              <span>Font size (px)</span>
              <input
                type="number"
                min="18"
                max="120"
                value={form.captionFontSize}
                onChange={setNumber('captionFontSize')}
              />
            </label>
            <label className="field">
              <span>Visible lines</span>
              <input
                type="number"
                min="1"
                max="5"
                value={form.maxCaptions}
                onChange={setNumber('maxCaptions')}
              />
            </label>
            <label className="field">
              <span>Clear after (s)</span>
              <input
                type="number"
                min="3"
                max="120"
                value={form.captionIdleSeconds}
                onChange={setNumber('captionIdleSeconds')}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Voice detection</legend>
          <div className="field-row">
            <label className="field">
              <span>Silence sensitivity</span>
              <input
                type="range"
                min="0.005"
                max="0.06"
                step="0.001"
                value={form.vadThreshold}
                onChange={setNumber('vadThreshold')}
              />
              <small>{form.vadThreshold} (lower = more sensitive)</small>
            </label>
            <label className="field">
              <span>End phrase after (ms quiet)</span>
              <input
                type="number"
                min="300"
                max="3000"
                step="100"
                value={form.vadSilenceMs}
                onChange={setNumber('vadSilenceMs')}
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Appearance</legend>
          <div className="field-row">
            <label className="field">
              <span>Theme</span>
              <select value={form.theme} onChange={set('theme')}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <label className="field">
              <span>Accent color</span>
              <input type="color" value={form.accentColor} onChange={set('accentColor')} />
            </label>
          </div>
          <label className="field field--inline">
            <input type="checkbox" checked={form.alwaysOnTop} onChange={set('alwaysOnTop')} />
            Keep window always on top
          </label>
        </fieldset>

        <fieldset className="fieldset">
          <legend>Transcript display</legend>
          <div className="field-row">
            <label className="field">
              <span>Font size (px)</span>
              <input
                type="number"
                min="12"
                max="24"
                value={form.transcriptFontSize}
                onChange={setNumber('transcriptFontSize')}
              />
            </label>
            <label className="field field--inline">
              <input type="checkbox" checked={form.showTimestamps} onChange={set('showTimestamps')} />
              Show timestamps
            </label>
            <label className="field field--inline">
              <input type="checkbox" checked={form.showLatency} onChange={set('showLatency')} />
              Show latency
            </label>
            <label className="field field--inline">
              <input type="checkbox" checked={form.autoScroll} onChange={set('autoScroll')} />
              Auto-scroll to bottom
            </label>
          </div>
        </fieldset>
        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}