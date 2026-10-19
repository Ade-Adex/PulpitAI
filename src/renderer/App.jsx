// App: composes the UI from small components and owns the shared state.
import React, { useMemo, useState, useEffect } from 'react';
import AppHeader from './components/AppHeader.jsx';
import ControlBar from './components/ControlBar.jsx';
import AudioSourcePanel from './components/AudioSourcePanel.jsx';
import TranscriptPanel from './components/TranscriptPanel.jsx';
import OverlayPanel from './components/OverlayPanel.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import PipelineStatus from './components/PipelineStatus.jsx';
import { useSettings } from './hooks/useSettings.js';
import { useAudioCapture } from './hooks/useAudioCapture.js';
import { useTranscriber } from './hooks/useTranscriber.js';
import { effectiveProvider } from './lib/providers.js';

export default function App() {
  const { settings, save } = useSettings();
  const { segments, pipelineState, lastError, lastWarning, submitClip, clearSegments } = useTranscriber();

  const [source, setSource] = useState('mic'); // 'mic' | 'system' | 'both'
  const [deviceId, setDeviceId] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Apply theme to document element.
  useEffect(() => {
    if (settings?.theme) {
      document.documentElement.setAttribute('data-theme', settings.theme);
      document.body.setAttribute('data-theme', settings.theme);
    }
  }, [settings?.theme]);

  // Memoised so useAudioCapture's start() identity stays stable across renders.
  const vad = useMemo(
    () => ({
      threshold: settings?.vadThreshold ?? 0.018,
      silenceMs: settings?.vadSilenceMs ?? 400,
      maxUtteranceMs: settings?.maxUtteranceMs ?? 6000,
    }),
    [settings?.vadThreshold, settings?.vadSilenceMs, settings?.maxUtteranceMs],
  );

  const capture = useAudioCapture({
    source,
    deviceId,
    vad,
    onUtterance: submitClip,
  });

  const listening = capture.status === 'listening';

  return (
    <div className="app">
      <AppHeader listening={listening} alwaysOnTop={settings?.alwaysOnTop} />
      <ControlBar
        listening={listening}
        status={capture.status}
        onToggle={listening ? capture.stop : capture.start}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="layout">
        <div className="layout__left">
          <AudioSourcePanel
            source={source}
            deviceId={deviceId}
            devices={capture.devices}
            level={capture.level}
            error={capture.error}
            onSourceChange={setSource}
            onDeviceChange={setDeviceId}
            onRefreshDevices={capture.refreshDevices}
          />
          <PipelineStatus
            state={pipelineState}
            error={lastError}
            warning={lastWarning}
            provider={settings ? effectiveProvider(settings) : null}
            demoMode={settings ? effectiveProvider(settings) === 'demo' : false}
          />
          <OverlayPanel settings={settings} onSave={save} />
        </div>

        <div className="layout__right">
          <TranscriptPanel segments={segments} onClear={clearSegments} settings={settings} />
        </div>
      </main>

      {showSettings && settings && (
        <SettingsPanel settings={settings} onSave={save} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
