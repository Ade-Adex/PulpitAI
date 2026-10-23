// App: rebranded single-window shell (PulpitAI Pro Presenter inspired).
// Top bar â€” logo + module tabs + broadcast controls
// 3-column body â€” Left hymnal sidebar | Center OBS preview + song library | Right hymn detail panel
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AudioSourcePanel from './components/AudioSourcePanel.jsx'
import ModuleLoader from './components/ModuleLoader.jsx'
import OverlayPanel from './components/OverlayPanel.jsx'
import PipelineStatus from './components/PipelineStatus.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import SplashScreen from './components/SplashScreen.jsx'
import TranscriptPanel from './components/TranscriptPanel.jsx'
import HymnDisplay from './components/HymnDisplay.jsx'
import { useAudioCapture } from './hooks/useAudioCapture.js'
import { useSettings } from './hooks/useSettings.js'
import { useTranscriber } from './hooks/useTranscriber.js'
import { effectiveProvider } from './lib/providers.js'
import { api } from './lib/api.js'

const MODULE_LABELS = {
  captioning: 'Captioning',
  hymns: 'Hymns',
  bible: 'Bible',
}

function moduleIcon(id) {
  return id === 'captioning' ? 'ðŸŽ™ï¸' : id === 'hymns' ? 'ðŸŽµ' : 'ðŸ“–'
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
  })
  // ---------------------------------------------------------------
  // Capture / transcript state
  // ---------------------------------------------------------------
  const [source, setSource] = useState('mic')
  const [deviceId, setDeviceId] = useState('')
  const {
    segments,
    pipelineState,
    lastError,
    lastWarning,
    submitClip,
    clearSegments,
  } = useTranscriber()
  const vad = useMemo(() => ({
    threshold: settings?.vadThreshold ?? 0.018,
    silenceMs: settings?.vadSilenceMs ?? 400,
    maxUtteranceMs: settings?.maxUtteranceMs ?? 6000,
  }), [settings?.vadThreshold, settings?.vadSilenceMs, settings?.maxUtteranceMs])
  const capture = useAudioCapture({ source, deviceId, vad, onUtterance: submitClip })
  const listening = capture.status === 'listening'

  const changeModules = useCallback(() => {
    ModuleLoader.open(() => {
      const next = ModuleLoader.selected()
      setEnabled(next)
      setActiveTab(next[0] ?? null)
      setPreviousModules(next)
    })
  }, [])

  const hasCaptioning = enabled && enabled.includes('captioning')

  // ---------------------------------------------------------------
  // Hymn module state (ported from HymnBrowser)
  // ---------------------------------------------------------------
  const [provider, setProvider] = useState(null)
  const [churches, setChurches] = useState([])
  const churchesRef = useRef(null)
  const [currentChurchId, setCurrentChurchId] = useState(null)

  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [query, setQuery] = useState('')
  const [hymns, setHymns] = useState([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Selected hymn for detail panel
  const [selectedHymn, setSelectedHymn] = useState(null)
  const [lyricsLoading, setLyricsLoading] = useState(false)

  // Display window state (lower third / full screen)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [displayHymn, setDisplayHymn] = useState(null)
  const [displayMode, setDisplayMode] = useState('fullscreen')
  const [textColor, setTextColor] = useState('#ffffff')
  const [bgColor, setBgColor] = useState('#0e1116')
  const [bgImage, setBgImage] = useState(null)

  // Recent searches (max 10)
  const [recentSearches, setRecentSearches] = useState([])

  const buildProvider = useCallback((churchList, churchId) => {
    const church =
      (churchList || []).find((c) => String(c.id) === String(churchId)) ??
      (churchList || [])[0] ??
      null
    if (!church) {
      setProvider(null)
      return
    }
    const p = api.createChristBCHymnProvider({
      christbcApiKey: church.christbcApiKey ?? '',
      christbcEnvironment: church.christbcEnvironment ?? 'live',
      christbcBaseUrl: church.christbcBaseUrl ?? 'https://dev.christbcogbomoso.org',
    })
    setProvider(p)
  }, [])

  useEffect(() => {
    buildProvider(churches, currentChurchId)
  }, [currentChurchId, churches, buildProvider])

  const addToRecent = useCallback((hymn) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r.number !== hymn.number)
      const next = [{ ...hymn, searchedAt: Date.now() }, ...filtered].slice(0, 10)
      api.saveSettings({ recentSearches: next }).catch(() => {})
      return next
    })
  }, [])

  const removeRecent = useCallback((number) => {
    setRecentSearches((prev) => {
      const next = (prev || []).filter((r) => String(r.number) !== String(number))
      api.saveSettings({ recentSearches: next }).catch(() => {})
      return next
    })
  }, [])

  const sendToDisplay = useCallback((hymn, mode) => {
    if (!hymn) return
    setDisplayHymn(hymn)
    if (mode) {
      setDisplayMode(mode)
      api.saveSettings({ hymnDisplayMode: mode }).catch(() => {})
    }
    setDisplayOpen(true)
    addToRecent(hymn)
  }, [addToRecent])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const s = await api.getSettings()
        if (cancelled) return
        const savedChurches = s?.churches ?? []
        const current = s?.currentChurch ?? savedChurches[0]?.id ?? null
        churchesRef.current = JSON.stringify(savedChurches)
        setChurches(savedChurches)
        setCurrentChurchId(current)
        setRecentSearches(s?.recentSearches ?? [])
        setDisplayMode(s?.hymnDisplayMode ?? 'fullscreen')
        setTextColor(s?.hymnTextColor ?? '#ffffff')
        setBgColor(s?.hymnBgColor ?? '#0e1116')
        setBgImage(s?.hymnBgImage ?? null)
        buildProvider(savedChurches, current)
      } catch (e) {
        if (!cancelled) setError({ message: String(e?.message || e) })
      }
    })()
    return () => { cancelled = true }
  }, [buildProvider])

  useEffect(() => {
    if (!settings) return
    const savedChurches = settings.churches ?? []
    const nextJson = JSON.stringify(savedChurches)
    if (churchesRef.current !== nextJson) {
      churchesRef.current = nextJson
      setChurches(savedChurches)
      setCurrentChurchId(settings.currentChurch ?? savedChurches[0]?.id ?? null)
      buildProvider(savedChurches, settings.currentChurch ?? savedChurches[0]?.id ?? null)
    }
  }, [settings, buildProvider])

  const loadHymns = useCallback(
    async ({ reset = true, q, category, page: pageNum } = {}) => {
      if (!provider) return
      const cat = category !== undefined ? category : selectedCategory
      const pageNumber = reset ? 1 : pageNum ?? page
      setLoading(true)
      setError(null)
      try {
        const res = await provider.listHymns({
          page: pageNumber,
          limit: 20,
          q: (q !== undefined ? q : query) || undefined,
          category: cat || undefined,
        })
        if (res.ok) {
          const data = res.data ?? {}
          const list = data.hymns ?? data.items ?? data.results ?? []
          setHymns((prev) => (reset ? list : [...prev, ...list]))
          setPage(pageNumber + 1)
          const pagination = data.pagination ?? {}
          setHasMore(pagination.hasMore ?? list.length === 20)
          if (q !== undefined ? q : query) {
            setRecentSearches((prev) => {
              const term = String(q !== undefined ? q : query).trim()
              const filtered = (prev || []).filter((r) => (r.label || '') !== term)
              const next = [
                { number: null, label: term, searchedAt: Date.now() },
                ...filtered,
              ].slice(0, 10)
              api.saveSettings({ recentSearches: next }).catch(() => {})
              return next
            })
          }
        } else {
          if (reset) setHymns([])
          setError(res.error)
        }
      } catch (e) {
        setError({ message: String(e?.message || e) })
      } finally {
        setLoading(false)
      }
    },
    [provider, page, query, selectedCategory],
  )

  const searchHymns = useCallback((term, pageNum = 1) => {
    const t = (term ?? '').trim()
    setQuery(t)
    setPage(pageNum)
    return loadHymns({ reset: pageNum === 1, q: t, page: pageNum })
  }, [loadHymns])

  useEffect(() => {
    if (!provider) return
    loadHymns({ reset: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, selectedCategory, loadHymns])

  const loadHymn = useCallback(async (number) => {
    if (!provider || number == null) return
    setLyricsLoading(true)
    setSelectedHymn(null)
    setError(null)
    try {
      const res = await provider.getHymn(number)
      if (res.ok) {
        setSelectedHymn(res.data)
        addToRecent(res.data)
      } else {
        setError(res.error)
      }
    } catch (e) {
      setError({ message: String(e?.message || e) })
    } finally {
      setLyricsLoading(false)
    }
  }, [provider, addToRecent])

  const handleChurchChange = async (e) => {
    const id = e.target.value
    setCurrentChurchId(id)
    setHymns([])
    setPage(1)
    setSelectedHymn(null)
    setError(null)
    api.saveSettings({ currentChurch: id }).catch(() => {})
  }

  const handleDeleteChurch = async () => {
    if (!currentChurchId) return
    const target = churches.find((c) => String(c.id) === String(currentChurchId))
    const name = target?.name ?? target?.id ?? 'this church'
    if (!window.confirm(`Delete "${name}" from the hymn module?`)) return
    const nextChurches = churches.filter((c) => String(c.id) !== String(currentChurchId))
    const nextCurrent = nextChurches[0]?.id ?? null
    setChurches(nextChurches)
    setCurrentChurchId(nextCurrent)
    setHymns([])
    setPage(1)
    setSelectedHymn(null)
    setError(null)
    try {
      await api.saveSettings({ churches: nextChurches, currentChurch: nextCurrent })
    } catch {
      // ignore
    }
  }

  const handleBgUpload = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      setBgImage(url)
      api.saveSettings({ hymnBgImage: url }).catch(() => {})
    }
    reader.readAsDataURL(file)
  }, [])

  const persistDisplayPrefs = useCallback((patch) => {
    api.saveSettings(patch).catch(() => {})
  }, [])

  const singleModule = enabled && enabled.length === 1

  return (
    <div className="app">
      {preloading && <SplashScreen progress={loadProgress} />}

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
                  onClick={() => setActiveTab(m)}
                >
                  <span className="appbar__tab__icon">{moduleIcon(m)}</span>
                  <span className="appbar__tab__label">{MODULE_LABELS[m] ?? m}</span>
                </button>
              ))}
            </>
          )}
          {singleModule && (
            <button className="appbar__tab is-active" onClick={changeModules} title="Change modules">
              <span className="appbar__tab__icon">ðŸ§©</span>
              <span className="appbar__tab__label">Modules</span>
            </button>
          )}
        </nav>
        <div className="appbar__controls">
          {hasCaptioning && (
            <button
              className={`btn btn--small ${listening ? 'btn--danger' : 'btn--primary'}`}
              onClick={listening ? capture.stop : capture.start}
              disabled={capture.status === 'starting'}
              title={listening ? 'Stop capturing' : 'Start capturing'}
            >
              {listening ? 'Stop' : 'Start'}
            </button>
          )}
          <span className="obs-source">
            <span className="obs-source__icon">ðŸ“º</span> OBS Browser Source
          </span>
          <button className="btn btn--icon" title="Copy source URL">ðŸ”—</button>
          <span className="broadcast-badge">
            <span className="broadcast-badge__dot"></span> BROADCAST READY
          </span>
          <button className="btn btn--live" title="Go live">
            <span className="btn--live__icon">ðŸ“¡</span> LIVE ON AIR
          </button>
          <button className="btn btn--icon btn--small" onClick={() => setShowSettings(true)} title="Settings">
            âš™
          </button>
         </div>
       </header>
      <main className="layout">
        <aside className="layout__left">
          <section className="section hymnal__wrap">
            <div className="section__head">
              <span className="section__title">Hymnal Collection</span>
              <span className="section__count">{hymns.length > 0 ? hymns.length + ' Songs' : '1,250 Songs'}</span>
            </div>
            <select
              className="hymnal__select"
              value={currentChurchId ?? ''}
              onChange={handleChurchChange}
              disabled={churches.length === 0}
            >
              <option value="">Select church</option>
              {churches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.id}
                </option>
              ))}
            </select>
            {churches.length > 0 && (
              <button
                type="button"
                className="btn btn--ghost btn--small btn--reset"
                aria-label="Delete selected church"
                title="Delete selected church"
                onClick={handleDeleteChurch}
                disabled={!currentChurchId}
              >
                ðŸ—‘ï¸
              </button>
            )}
          </section>

          <section className="section">
            <div className="section__head">
              <span className="section__title">Search</span>
            </div>
            <div className="search-box">
              <span className="search-box__icon">ðŸ”</span>
              <input
                className="search-box__input"
                placeholder="Search #, title or lyric textâ€¦"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchHymns(query, 1)}
              />
            </div>
            <div className="search-box__hint">Press Enter to search</div>
          </section>

          <section className="section">
            <div className="section__head">
              <span className="section__title">Categories</span>
              <button
                className="btn btn--ghost btn--small btn--reset"
                onClick={() => setSelectedCategory(null)}
              >
                Reset
              </button>
            </div>
            <div className="categories__row">
              <button
                className={`category-pill ${!selectedCategory ? 'is-active' : ''}`}
                onClick={() => setSelectedCategory(null)}
              >
                All Hymns
              </button>
              {categories.map((cat) => {
                const label = typeof cat === 'string' ? cat : (cat?.name ?? cat?.title ?? String(cat))
                const value = typeof cat === 'string' ? cat : (cat?.slug ?? cat?.name ?? label)
                return (
                  <button
                    key={value}
                    className={`category-pill ${selectedCategory === value ? 'is-active' : ''}`}
                    onClick={() => setSelectedCategory(value)}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </section>
          <section className="section stage-display__wrap">
            <div className="section__head">
              <span className="section__title">Stage Display Styling</span>
            </div>
            <div className="stage-display__label">Display Mode</div>
            <select
              className="display-mode__select"
              value={displayMode}
              onChange={(e) => {
                setDisplayMode(e.target.value)
                persistDisplayPrefs({ hymnDisplayMode: e.target.value })
              }}
            >
              <option value="fullscreen">Lower Third (OBS Overlay)</option>
              <option value="lower">Full Screen</option>
            </select>
            <div className="color-row">
              <span className="color-label">Text Color</span>
              <div className="color-input-wrap">
                <input
                  className="color-input"
                  type="color"
                  value={textColor}
                  onChange={(e) => {
                    setTextColor(e.target.value)
                    persistDisplayPrefs({ hymnTextColor: e.target.value })
                  }}
                />
                <div className="color-swatch" style={{ backgroundColor: textColor }}></div>
              </div>
            </div>
            <div className="color-row">
              <span className="color-label">Background Color</span>
              <div className="color-input-wrap">
                <input
                  className="color-input"
                  type="color"
                  value={bgColor}
                  onChange={(e) => {
                    setBgColor(e.target.value)
                    persistDisplayPrefs({ hymnBgColor: e.target.value })
                  }}
                />
                <div className="color-swatch" style={{ backgroundColor: bgColor }}></div>
              </div>
            </div>
            <label className="upload-bg">
              ðŸ–¼ï¸ Upload Background Image
              <input type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
            </label>
            {bgImage && (
              <button
                className="btn btn--ghost btn--small btn--reset"
                onClick={() => {
                  setBgImage(null)
                  persistDisplayPrefs({ hymnBgImage: null })
                }}
              >
                Remove image
              </button>
            )}
          </section>

          {recentSearches.length > 0 && (
            <section className="section recent-searches">
              <div className="recent-searches__head">
                <span className="recent-searches__title">Recent Searches</span>
                <button
                  className="btn btn--ghost btn--small btn--reset"
                  onClick={() => {
                    setRecentSearches([])
                    api.saveSettings({ recentSearches: [] }).catch(() => {})
                  }}
                >
                  Clear
                </button>
              </div>
              <ul className="recent-list">
                {recentSearches.map((r) => (
                  <li key={String(r.number ?? r.label)} className="recent-item">
                    <button
                      className="recent-item__btn"
                      onClick={() => {
                        if (r.number != null) loadHymn(r.number)
                        else searchHymns(String(r.label || ''), 1)
                      }}
                    >
                      <span className="recent-item__num">
                        {r.number != null ? `#${r.number}` : 'ðŸ”'}
                      </span>
                      <span className="recent-item__title">{r.label}</span>
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      aria-label={`Remove ${r.label}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecent(r.number ?? r.label)
                      }}
                    >
                      âœ•
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
        <section className="layout__center">
          <div className="obs-preview">
            <div className="obs-preview__bar">
              <div className="obs-preview__title">
                <span className="obs-preview__dot"></span>
                OBS Live Output Preview
              </div>
              <div className="obs-preview__actions">
                <button className="btn btn--ghost btn--small">Clear Text</button>
                <button className="btn btn--icon btn--small" title="Black">â¬›</button>
                <button className="btn btn--icon btn--small" title="Logo">ðŸ–¼ï¸</button>
              </div>
            </div>
            <div className="obs-preview__pane">
              <div className="obs-preview__pane__inner">
                Stage Overlay URL<br />
                http://localhost:8080/stage-overlay
              </div>
            </div>
            <div className="obs-preview__footer">
              <div className="obs-footer__left">
                <span>60 FPS Smooth Rendering</span>
              </div>
              <div>
                <span className="obs-fps">â— LIVE</span>
              </div>
            </div>
          </div>
          <div className="song-library">
            <div className="song-library__bar">
              <div className="song-library__title">
                ðŸŽµ Song Library & Hymns
                <span className="song-library__count">{hymns.length} Hymns</span>
              </div>
              <div className="song-library__controls">
                <div className="filter-box">
                  <span className="filter-box__icon">ðŸ”</span>
                  <input
                    className="filter-box__input"
                    placeholder="Filter by title or numberâ€¦"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchHymns(query, 1)}
                  />
                </div>
                <select className="sort-box">
                  <option>â†• Sort #</option>
                </select>
              </div>
            </div>
            <div className="song-table-wrap">
              <table className="song-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Hymn #</th>
                    <th>Song Title</th>
                    <th style={{ width: 120 }}>Category</th>
                    <th style={{ width: 110 }}>Musical Key</th>
                    <th style={{ width: 100 }}>Verses Count</th>
                    <th style={{ width: 90 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                        Loading hymnsâ€¦
                      </td>
                    </tr>
                  )}
                  {!loading && hymns.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-dim)' }}>
                        No hymns found.
                      </td>
                    </tr>
                  )}
                  {hymns.map((h) => (
                    <tr
                      key={h.number}
                      className={`song-table__row ${selectedHymn?.number === h.number ? 'is-active' : ''}`}
                      onClick={() => loadHymn(h.number)}
                    >
                      <td>
                        <span className="song-number">#{h.number}</span>
                      </td>
                      <td>
                        <span className={`song-title ${selectedHymn?.number === h.number ? 'is-active' : ''}`}>
                          {h.title ?? 'Untitled'}
                        </span>
                      </td>
                      <td>
                        <span className="song-category">{h.category ?? 'General'}</span>
                      </td>
                      <td>
                        <span className="song-key">G Major</span>
                      </td>
                      <td>
                        <span className="song-verses">{h.verses?.length ?? 4} Verses</span>
                      </td>
                      <td>
                        <button
                          className="btn btn--present btn--small"
                          onClick={(e) => {
                            e.stopPropagation()
                            sendToDisplay(h, displayMode)
                          }}
                        >
                          Present
                        </button>
                      </td>
                    </tr>
                  ))}
                  {hasMore && !loading && hymns.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 10 }}>
                        <button
                          className="btn btn--ghost btn--small"
                          onClick={() => loadHymns({ reset: false })}
                        >
                          Load more
                        </button>
                      </td>
                    </tr>
                  )}
                  {error && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 16, color: 'var(--red)' }}>
                        {error.message}
                        {error.retryable && (
                          <button
                            className="btn btn--small"
                            style={{ marginLeft: 8 }}
                            onClick={() => loadHymns(true)}
                          >
                            Retry
                          </button>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <aside className="layout__right">
          {selectedHymn ? (
            <div className="hymn-detail">
              <div className="hymn-detail__head">
                <div className="hymn-detail__meta">
                  <span className="hymn-detail__number">HYMN #{selectedHymn.number}</span>
                  <span className="hymn-detail__category">{selectedHymn.category ?? 'General'}</span>
                  <span className="hymn-detail__key">Key: G Major</span>
                </div>
                <div>
                  <span className="hymn-detail__air">ON AIR</span>
                </div>
              </div>
              <h1 className="hymn-detail__title">{selectedHymn.title ?? 'Untitled'}</h1>
              <div className="hymn-detail__hint">
                Press <span className="hymn-detail__keypress">1-9</span> or <span className="hymn-detail__keypress">â†‘ â†“</span> to change verses
                &nbsp;Â·&nbsp;
                <span style={{ cursor: 'pointer', color: 'var(--accent)' }}>Click card to air live</span>
              </div>
              <div className="verse-list">
                {lyricsLoading ? (
                  <div className="hymn__loading">Loading versesâ€¦</div>
                ) : (
                  (selectedHymn.verses ?? []).map((verse, i) => (
                    <div key={i} className="verse-card">
                      <div className="verse-card__header">
                        <span className="verse-card__label">Verse {i + 1}</span>
                        <span className="verse-card__air-badge">ON AIR</span>
                      </div>
                      <div className="verse-card__body">
                        {Array.isArray(verse) ? verse.join('\n') : verse}
                      </div>
                    </div>
                  ))
                )}
                {(selectedHymn.verses?.length ?? 0) === 0 && (
                  <div className="hymn__loading">No verse text available.</div>
                )}
              </div>
              <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn--primary btn--small"
                  onClick={() => sendToDisplay(selectedHymn, 'lower')}
                >
                  Show lower third
                </button>
                <button
                  className="btn btn--primary btn--small"
                  onClick={() => sendToDisplay(selectedHymn, displayMode)}
                >
                  Show {displayMode === 'lower' ? 'lower third' : 'full screen'}
                </button>
              </div>
            </div>
          ) : (
            <div className="panel">
              <h2 className="panel__title">Select a hymn to view lyrics</h2>
              <button className="btn btn--ghost btn--small" onClick={changeModules}>
                Change modules
              </button>
            </div>
          )}
        </aside>
      </main>


      {showSettings && settings && (
        <SettingsPanel settings={settings} onSave={save} onClose={() => setShowSettings(false)} />
      )}

      {displayOpen && displayHymn && (
        <div className="hymn__display__overlay" onClick={() => setDisplayOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <HymnDisplay
              hymn={displayHymn}
              mode={displayMode}
              textColor={textColor}
              backgroundColor={bgColor}
              backgroundImage={bgImage}
              onClose={() => setDisplayOpen(false)}
            />
            <div className="hymn__display__switch">
              <button
                className={`btn btn--small ${displayMode === 'fullscreen' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => {
                  setDisplayMode('fullscreen')
                  persistDisplayPrefs({ hymnDisplayMode: 'fullscreen' })
                }}
              >
                Full screen
              </button>
              <button
                className={`btn btn--small ${displayMode === 'lower' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => {
                  setDisplayMode('lower')
                  persistDisplayPrefs({ hymnDisplayMode: 'lower' })
                }}
              >
                Lower third
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
