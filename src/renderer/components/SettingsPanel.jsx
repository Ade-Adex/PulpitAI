import React, { useEffect, useState } from 'react';
import { PROVIDERS } from '../lib/providers.js';
import { api } from '../lib/api.js';

// Modal settings editor. Local form state, saves on close.
export default function SettingsPanel({ settings, onSave, onClose }) {
  const [form, setForm] = useState(settings);

  // The main process can auto-heal a retired provider model (see the GroQ
  // fallback in the pipeline) and persist the working one. Re-read the
  // authoritative settings on mount so the form never shows - and then
  // re-saves - a model that is already known to be dead.
  useEffect(() => {
    let cancelled = false;
    api.getSettings().then((fresh) => {
      if (!cancelled && fresh) setForm((f) => ({ ...f, ...fresh }));
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      textColor: form.textColor,
      bgColor: form.bgColor,
      bgImage: form.bgImage,
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

        {form.provider === 'auto' && (
          <p className="hint">
            Auto uses the first configured key below. Pick a specific provider above to configure
            only that one.
          </p>
        )}
        {form.provider === 'demo' && (
          <p className="hint">
            Demo mode needs no API key — captions are simulated so you can test the mic, VAD and
            the OBS overlay.
          </p>
        )}

        {(form.provider === 'auto' || form.provider === 'gemini') && (
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
        )}

        {(form.provider === 'auto' || form.provider === 'groq') && (
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
              Free key at <strong>console.groq.com</strong> → <em>API Keys</em>. Whisper
              transcribes Yoruba; GPT-OSS translates to English.
            </small>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Transcription model</span>
              <select value={form.groqSttModel} onChange={set('groqSttModel')}>
                <option value="whisper-large-v3">whisper-large-v3 (recommended)</option>
                <option value="whisper-large-v3-turbo">whisper-large-v3-turbo</option>
              </select>
            </label>
            <label className="field">
              <span>Translation model</span>
              <select value={form.groqChatModel} onChange={set('groqChatModel')}>
                <option value="openai/gpt-oss-120b">GPT-OSS 120B (recommended)</option>
                <option value="openai/gpt-oss-20b">GPT-OSS 20B</option>
                <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
              </select>
            </label>
          </div>
        </fieldset>
        )}

        {(form.provider === 'auto' || form.provider === 'openai') && (
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
        )}

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
        <fieldset className="fieldset">
          <legend>Churches (Hymn module)</legend>
          <p className="hint">
            Each church can have its own Christ BC Hymn API key. Switch churches
            in the Hymn Display module.
          </p>

          <label className="field">
            <span>Current church</span>
            <select value={form.currentChurch ?? ''} onChange={set('currentChurch')}>
              <option value="">— none selected —</option>
              {form.churches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Church name</span>
              <input
                type="text"
                value={form.newChurchName ?? ''}
                onChange={set('newChurchName')}
                placeholder="e.g. Christ Baptist Church"
              />
            </label>
            <label className="field">
              <span>API key</span>
              <input
                type="password"
                value={form.newChurchKey ?? ''}
                onChange={set('newChurchKey')}
                placeholder="Christ BC hymn key"
                autoComplete="off"
              />
              <small>Key must be issued for api: "hymns"</small>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Environment</span>
              <select value={form.newChurchEnv ?? 'live'} onChange={set('newChurchEnv')}>
                <option value="live">Live</option>
                <option value="testing">Testing</option>
                <option value="integration">Integration</option>
              </select>
            </label>
            <label className="field field--inline" style={{ marginTop: 0 }}>
              <button
                className="btn btn--primary btn--small"
                onClick={() => {
                  const name = form.newChurchName?.trim();
                  const key = form.newChurchKey?.trim();
                  if (!name || !key) return;
                  const church = {
                    id: String(Date.now()),
                    name,
                    christbcApiKey: key,
                    christbcEnvironment: form.newChurchEnv ?? 'live',
                    christbcBaseUrl: form.christbcBaseUrl ?? 'https://dev.christbcogbomoso.org',
                  };
                  setForm((f) => ({
                    ...f,
                    churches: [...(f.churches ?? []), church],
                    currentChurch: church.id,
                    newChurchName: '',
                    newChurchKey: '',
                  }));
                }}
              >
                Add church
              </button>
            </label>
          </div>

          {form.churches?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <small style={{ color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                Saved churches:
              </small>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.churches.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '6px 8px',
                      border: '1px solid var(--border, #2a2f3a)',
                      borderRadius: 6,
                      background: 'var(--surface, #161a22)',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>
                      {c.name}
                      {String(form.currentChurch) === String(c.id) && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--accent, #4da3ff)' }}>
                          (current)
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => {
                        setForm((f) => {
                          const nextChurches = (f.churches ?? []).filter(
                            (x) => String(x.id) !== String(c.id),
                          );
                          let nextCurrent = f.currentChurch;
                          if (String(f.currentChurch) === String(c.id)) {
                            nextCurrent = nextChurches[0]?.id ?? null;
                          }
                          return {
                            ...f,
                            churches: nextChurches,
                            currentChurch: nextCurrent,
                          };
                        });
                      }}
                      aria-label={`Delete ${c.name}`}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ marginTop: 24 }}>
            <small style={{ color: 'var(--text-dim)' }}>Hymn Display Appearance</small>
          </div>
          <div style={{ marginTop: 8 }}>
            <label className="field">
              <span>Text Color</span>
              <input
                type="color"
                value={form.textColor ?? '#ffffff'}
                onChange={e => setForm(f => ({ ...f, textColor: e.target.value }))}
                style={{ width: 'auto', height: 30, padding: 0, border: '1px solid var(--border)', background: form.textColor ?? '#ffffff', cursor: 'pointer' }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label className="field">
              <span>Background Color</span>
              <input
                type="color"
                value={form.bgColor ?? '#0e1116'}
                onChange={e => setForm(f => ({ ...f, bgColor: e.target.value }))}
                style={{ width: 'auto', height: 30, padding: 0, border: '1px solid var(--border)', background: form.bgColor ?? '#0e1116', cursor: 'pointer' }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8 }}>
            <label className="field">
              <span>Background Image</span>
              <input
                type="file"
                accept="image/*"
                onChange={e => setForm(f => ({ ...f, bgImage: e.target.files[0] }))}
                style={{ display: 'block', margin: '4px 0' }}
              />
              <small style={{ color: 'var(--text-dim)' }}>
                PNG, JPEG, SVG. Simple image for best results.
              </small>
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