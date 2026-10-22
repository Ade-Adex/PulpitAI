// App: composes the UI from small components and owns the shared state.
// Unified single-window shell (EasyWorship / ProPresenter inspired):
// all enabled modules live in ONE interface. The user switches the active
// module via the tab strip; the active module's main view renders in
// layout__right (just like the transcript did). No separate full-screen apps
// are loaded when more than one module is selected.
import { useEffect, useMemo, useRef, useState } from 'react'
import AudioSourcePanel from './components/AudioSourcePanel.jsx'
import HymnBrowser from './components/HymnBrowser.jsx'
import ModuleLoader from './components/ModuleLoader.jsx'
import OverlayPanel from './components/OverlayPanel.jsx'
import PipelineStatus from './components/PipelineStatus.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'
import { useAudioCapture } from './hooks/useAudioCapture.js'
import { useSettings } from './hooks/useSettings.js'
import { useTranscriber } from './hooks/useTranscriber.js'
import { effectiveProvider } from './lib/providers.js'

const MODULE_LABELS = {
  captioning: 'Captioning',
  hymns: 'Hymns',
  bible: 'Bible',
}

function moduleIcon(id) {
  return id === 'captioning' ? '🎙️' : id === 'hymns' ? '🎵' : '📖'
}

export default function App() {
  const { settings, save } = useSettings()

  const settingsRef = useRef(null)
  settingsRef.current = settings

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    if (settingsRef.current?.theme) {
      document.documentElement.setAttribute('data-theme', settingsRef.current.theme)
      document.body.setAttribute('data-theme', settingsRef.current.theme)
    }
  }, [])

  const [showSettings, setShowSettings] = useState(false)

  const [preloading, setPreloading] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [enabled, setEnabled] = useState(null)
  const [activeTab, setActiveTab] = useState(null)

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

  useEffect(() => {
    if (!settings || enabled !== null) return
    const saved = localStorage.getItem('pulpitai-modules')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEnabled(parsed)
          setActiveTab(parsed[0] ?? null)
          setPreviousModules(parsed)
        }
      } catch {
        // ignore malformed JSON
      }
    }
  }, [settings, enabled])

  useEffect(() => {
    if (enabled !== null) {
      localStorage.setItem('pulpitai-modules', JSON.stringify(enabled))
    }
  }, [enabled])

  useEffect(() => {
    if (!preloading) {
      setLoadProgress(0)
      return
    }
    setLoadProgress(0)
    let p = 0
    const id = setInterval(() => {
      p = Math.min(100, p + 4)
      setLoadProgress(p)
      if (p >= 100) {
        clearInterval(id)
        setTimeout(() => setPreloading(false), 250)
      }
    }, 40)
    return () => clearInterval(id)
  }, [preloading])

  const [source, setSource] = useState('mic')
  const [deviceId, setDeviceId] = useState('')

  const { segments, pipelineState, lastError, lastWarning, submitClip, clearSegments } = useTranscriber()

  const vad = useMemo(
    () => ({
      threshold: settings?.vadThreshold ?? 0.018,
      silenceMs: settings?.vadSilenceMs ?? 400,
      maxUtteranceMs: settings?.maxUtteranceMs ?? 6000,
    }),
    [settings?.vadThreshold, settings?.vadSilenceMs, settings?.maxUtteranceMs],
  )

  const capture = useAudioCapture({ source, deviceId, vad, onUtterance: submitClip })
  const listening = capture.status === 'listening'

  if (!settings || enabled === null) {
    return (
      <SplashScreen
        initial={previousModules || []}
        onCancel={
          previousModules && previousModules.length
            ? () => {
                setEnabled(previousModules)
                setActiveTab(previousModules[0] ?? null)
              }
            : undefined
        }
        onStart={(modules) => {
          const filtered = modules.filter((m) => m !== 'bible')
          setEnabled(filtered)
          setActiveTab(filtered[0] ?? null)
          setPreviousModules(filtered)
          setPreloading(true)
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
    return <ModuleLoader modules={enabled || []} progress={loadProgress} />
  }

  const changeModules = () => {
    setPreviousModules(enabled || [])
    try {
      localStorage.setItem('pulpitai-last-modules', JSON.stringify(enabled || []))
    } catch {
      // ignore
    }
    setActiveTab(null)
    setEnabled(null)
    setShowSettings(false)
    localStorage.removeItem('pulpitai-modules')
  }

  const hasCaptioning = enabled.includes('captioning')
  const singleModule = (enabled || []).length <= 1
  return (
    <div className='app'>
      <header className='appbar'>
        <img className='appbar__logo' src='./logo.png' alt='PulpitAI logo' />
        <h1 className='appbar__title'>
          Pulpit<span className='appbar__accent'>AI</span>
        </h1>

        {!singleModule && (
          <nav className='module-tabs' aria-label='Modules'>
            {enabled.map((m) => (
              <button
                key={m}
                className={`module-tab ${activeTab === m ? 'is-active' : ''}`}
                onClick={() => setActiveTab(m)}
              >
                <span className='module-tab__icon'>{moduleIcon(m)}</span>
                {MODULE_LABELS[m] ?? m}
              </button>
            ))}
          </nav>
        )}

        <div className='appbar__controls'>
          {hasCaptioning && (
            <button
              className={`btn btn--primary ${listening ? 'btn--danger' : ''} btn--small`}
              onClick={listening ? capture.stop : capture.start}
              disabled={capture.status === 'starting'}
            >
              {listening ? 'Stop' : 'Start'}
            </button>
          )}
          <button className='btn btn--ghost btn--small' onClick={() => setShowSettings(true)}>
            ⚙
          </button>
          <button className='btn btn--ghost btn--small' onClick={changeModules}>
            🧩
          </button>
        </div>
      </header>

      <main className={`layout ${activeTab === 'captioning' ? '' : 'layout--single'}`}>
        {activeTab === 'captioning' && (
          <aside className='layout__left'>
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
          </aside>
        )}

        <section className='layout__right'>
          {activeTab === 'captioning' && (
            <TranscriptPanel segments={segments} onClear={clearSegments} settings={settings} />
          )}
          {activeTab === 'hymns' && (
            <HymnBrowser onBack={changeModules} settings={settings} onSettings={() => setShowSettings(true)} compact />
          )}
          {activeTab === 'bible' && (
            <div className='panel panel--center'>
              <h2 className='panel__title'>Bible Display — coming soon</h2>
              <button className='btn btn--ghost btn--small' onClick={changeModules}>
                Change modules
              </button>
            </div>
          )}
          {activeTab === null && (
            <div className='panel panel--center'>
              <h2 className='panel__title'>Select a module tab above</h2>
            </div>
          )}
        </section>
      </main>

      {showSettings && settings && (
        <SettingsPanel settings={settings} onSave={save} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

