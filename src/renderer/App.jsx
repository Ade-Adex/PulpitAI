// App: composes the UI from small components and owns the shared state.
// Req #1 - only modules the user enabled on the splash screen are mounted.
// Captioning hooks/pipeline render only when 'captioning' is enabled;
// the hymn browser only when 'hymns' is enabled; 'bible' is a placeholder.
import { useEffect, useMemo, useRef, useState } from 'react'
import AppHeader from './components/AppHeader.jsx'
import AudioSourcePanel from './components/AudioSourcePanel.jsx'
import ControlBar from './components/ControlBar.jsx'
import HymnBrowser from './components/HymnBrowser.jsx'
import ModuleLoader from './components/ModuleLoader.jsx';
import OverlayPanel from './components/OverlayPanel.jsx'
import PipelineStatus from './components/PipelineStatus.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'
import { useAudioCapture } from './hooks/useAudioCapture.js'
import { useSettings } from './hooks/useSettings.js'
import { useTranscriber } from './hooks/useTranscriber.js'
import { effectiveProvider } from './lib/providers.js'

function CaptioningModule({ settings, save, showSettings, setShowSettings, onReselectModules }) {
  const {
    segments,
    pipelineState,
    lastError,
    lastWarning,
    submitClip,
    clearSegments,
  } = useTranscriber()

  const [source, setSource] = useState('mic') // 'mic' | 'system' | 'both'
  const [deviceId, setDeviceId] = useState('')

  // Memoised so useAudioCapture's start() identity stays stable across renders.
  const vad = useMemo(
    () => ({
      threshold: settings?.vadThreshold ?? 0.018,
      silenceMs: settings?.vadSilenceMs ?? 400,
      maxUtteranceMs: settings?.maxUtteranceMs ?? 6000,
    }),
    [settings?.vadThreshold, settings?.vadSilenceMs, settings?.maxUtteranceMs],
  )

  const capture = useAudioCapture({
    source,
    deviceId,
    vad,
    onUtterance: submitClip,
  })

  const listening = capture.status === 'listening'

  return (
    <>
      <ControlBar
        listening={listening}
        status={capture.status}
        onToggle={listening ? capture.stop : capture.start}
        onOpenSettings={() => setShowSettings(true)}
        onReselectModules={onReselectModules}
      />
      <main className='layout'>
        <div className='layout__left'>
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

        <div className='layout__right'>
          <TranscriptPanel
            segments={segments}
            onClear={clearSegments}
            settings={settings}
          />
        </div>
      </main>
    </>
  )
}

export default function App() {
  const { settings, save } = useSettings()

  // Apply theme using ref to avoid Vite HMR caching issues.
  const settingsRef = useRef(null)
  settingsRef.current = settings

  useEffect(() => {
    // Update the ref whenever settings changes (including during HMR reinitialization)
    settingsRef.current = settings
  }, [settings]) // Re-run when settings value changes from useSettings()

  useEffect(() => {
    if (settingsRef.current?.theme) {
      document.documentElement.setAttribute('data-theme', settingsRef.current.theme)
      document.body.setAttribute('data-theme', settingsRef.current.theme)
    }
  }, []) // Empty deps - theme tracked via ref that persists across HMR

  const [showSettings, setShowSettings] = useState(false)

  const [preloading, setPreloading] = useState(false);
  // Module selection - Req #1. enabled: modules chosen on the splash.
  // activeTab: which enabled module is currently shown.
  const [enabled, setEnabled] = useState(null)
  const [activeTab, setActiveTab] = useState(null)

  // Keep the last chosen module set so the SplashScreen can pre-check them
  // when the user clicks "Change modules" / "Change…" to reselect.
  const [previousModules, setPreviousModules] = useState(() => {
    try {
      const saved = localStorage.getItem('pulpitai-last-modules')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // ignore malformed JSON
    }
    return null
  })

  // Unique marker: NEW-SHELL-v2 - everything below is the lazy-loading shell.
  const __shellV2 = 1

  // First run: restore persisted module choice so the splash is skipped.
  useEffect(() => {
    if (!settings || enabled !== null) return
    const saved = localStorage.getItem('pulpitai-modules')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setEnabled(parsed)
          setActiveTab(parsed[0])
          setPreviousModules(parsed)
        }
      } catch {
        // ignore malformed JSON
      }
    }
  }, [settings, enabled])

  // Save module choice whenever it changes.
  useEffect(() => {
    if (enabled !== null) {
      localStorage.setItem('pulpitai-modules', JSON.stringify(enabled))
    }
  }, [enabled])

  // Render logic — show splash until settings load AND a module set is chosen.
  if (!settings || enabled === null) {
    return (
      <SplashScreen
        initial={previousModules || []}
        onCancel={
          previousModules && previousModules.length
            ? () => {
                setEnabled(previousModules)
                setActiveTab(previousModules[0])
              }
            : undefined
        }
        onStart={(modules) => {
          const filtered = modules.filter(m => m !== 'bible')
          setEnabled(filtered)
          setActiveTab(filtered[0])
          setPreviousModules(filtered)
          setPreloading(true)
          setTimeout(() => setPreloading(false), 600)
          try {
            localStorage.setItem('pulpitai-last-modules', JSON.stringify(filtered))
          } catch {
            // ignore
          }
        }}
      />
    )
  }

  if (preloading) {
    return <ModuleLoader modules={enabled || []} />;
  }

  const changeModules = () => {
    // Remember current selection so SplashScreen can pre-check them on reselect.
    setPreviousModules(enabled || [])
    try {
      localStorage.setItem('pulpitai-last-modules', JSON.stringify(enabled || []))
    } catch {
      // ignore
    }
    setActiveTab(null)
    setEnabled(null)
    setShowSettings(false)
    // Clear persisted modules so the restore-EFFECT below does not immediately
    // put `enabled` back, which would make the SplashScreen flash away.
    localStorage.removeItem('pulpitai-modules')
  }

  // ---------- Captioning module ----------
  if (activeTab === 'captioning') {
    return (
      <CaptioningModule
        settings={settings}
        save={save}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        onReselectModules={changeModules}
      />
    )
  }

  // ---------- Hymns module ----------
  if (activeTab === 'hymns') {
    return (
      <main className='layout'>
        <div className='layout__left'>
          <HymnBrowser
            onBack={changeModules}
            settings={settings}
            onSettings={() => setShowSettings(true)}
          />
        </div>
        <div className='layout__right' />
        {showSettings && settings && (
          <SettingsPanel
            settings={settings}
            onSave={save}
            onClose={() => setShowSettings(false)}
          />
        )}
      </main>
    )
  }

  // ---------- Bible module ----------
  if (activeTab === 'bible') {
    return (
      <main className='layout'>
        <div className='layout__left'>
          <div className='panel'>
            <h2 className='panel__title'>Bible Display - coming soon</h2>
            <button
              className='btn btn--ghost btn--small'
              onClick={changeModules}
            >
              Change modules
            </button>
          </div>
        </div>
        <div className='layout__right' />
      </main>
    )
  }

  // ---------- Default: all modules visible ----------
  return (
    <div className='app'>
      <AppHeader listening={false} alwaysOnTop={settings?.alwaysOnTop} />
      {enabled.length > 1 && (
        <nav className='module-tabs'>
          {enabled.includes('captioning') && (
            <button
              className={'module-tab ' + (activeTab === 'captioning' ? 'is-active' : '')}
              onClick={() => setActiveTab('captioning')}
            >
              Captioning
            </button>
          )}
          {enabled.includes('hymns') && (
            <button
              className={'module-tab ' + (activeTab === 'hymns' ? 'is-active' : '')}
              onClick={() => setActiveTab('hymns')}
            >
              Hymns
            </button>
          )}
          {enabled.includes('bible') && (
            <button
              className={'module-tab ' + (activeTab === 'bible' ? 'is-active' : '')}
              onClick={() => setActiveTab('bible')}
            >
              Bible
            </button>
          )}
          <button
            className='module-tab module-tab--change'
            onClick={changeModules}
          >
            Change modules
          </button>
        </nav>
      )}
      {enabled.length === 1 && (
        <nav className='module-tabs module-tabs--single'>
          <button
            className='module-tab module-tab--change'
            onClick={changeModules}
          >
            Reselect modules
          </button>
        </nav>
      )}
      {activeTab === 'captioning' && (
        <CaptioningModule
          settings={settings}
          save={save}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          onReselectModules={changeModules}
        />
      )}
      {activeTab === 'hymns' && (
        <main className='layout'>
          <div className='layout__left'>
            <HymnBrowser onBack={changeModules} settings={settings} />
          </div>
          <div className='layout__right' />
        </main>
      )}
      {activeTab === 'bible' && (
        <main className='layout'>
          <div className='layout__left'>
            <div className='panel'>
              <h2 className='panel__title'>Bible Display - coming soon</h2>
              <button
                className='btn btn--ghost btn--small'
                onClick={changeModules}
              >
                Change modules
              </button>
            </div>
          </div>
          <div className='layout__right' />
        </main>
      )}
      {showSettings && settings && (
        <SettingsPanel
          settings={settings}
          onSave={save}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
