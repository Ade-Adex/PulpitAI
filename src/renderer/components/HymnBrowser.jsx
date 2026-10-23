import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import HymnDisplay from './HymnDisplay.jsx';
import { MdSettings, MdArrowBack, MdClose } from 'react-icons/md';

/**
 * HymnBrowser — EasyWorship-inspired hymn display, kept light.
 *
 * Layout (EasyWorship-like):
 *   Top bar — church selector + prominent search
 *   Left sidebar — categories
 *   Center — hymn list cards (number, title, first line / author)
 *   Right / overlay — full lyrics when a hymn is selected
 *
 * Everything loads lazily via api.createChristBCHymnProvider(). The provider
 * is recreated when the church changes so each church uses its own key/env.
 *
 * Recent searches (up to 10) are persisted in settings so users can quickly
 * re-access a song. Each hymn can be sent to the display window (lower third
 * or full screen) for OBS/vMix/projector use.
 */
export default function HymnBrowser({ onBack, onSettings, settings, compact = false }) {
  const [provider, setProvider] = useState(null);
  const [churches, setChurches] = useState([]);
  const churchesRef = useRef(null);
  const [currentChurchId, setCurrentChurchId] = useState(null);

  // Data state
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [query, setQuery] = useState('');
  const [hymns, setHymns] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Selected hymn for lyrics view
  const [selectedHymn, setSelectedHymn] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // Display window state (lower third / full screen) — Req #3 + #4
  const [displayOpen, setDisplayOpen] = useState(false);
  const [displayHymn, setDisplayHymn] = useState(null);
  const [displayMode, setDisplayMode] = useState('fullscreen');
  const [textColor, setTextColor] = useState('#ffffff');
  const [bgColor, setBgColor] = useState('#0e1116');
  const [bgImage, setBgImage] = useState(null);

  // Recent searches — Req #5 (max 10)
  const [recentSearches, setRecentSearches] = useState([]);

  const buildProvider = useCallback((churchList, churchId) => {
    const church =
      (churchList || []).find((c) => String(c.id) === String(churchId)) ??
      (churchList || [])[0] ??
      null;
    if (!church) {
      setProvider(null);
      return;
    }
    const p = api.createChristBCHymnProvider({
      christbcApiKey: church.christbcApiKey ?? '',
      christbcEnvironment: church.christbcEnvironment ?? 'live',
      christbcBaseUrl: church.christbcBaseUrl ?? 'https://dev.christbcogbomoso.org',
    });
    setProvider(p);
  }, []);

  // Rebuild provider when church changes
  useEffect(() => {
    buildProvider(churches, currentChurchId);
  }, [currentChurchId, churches, buildProvider]);

  // --------------------------------------------------------------------------
  // Add a hymn to recent searches (max 10, most recent first)
  // --------------------------------------------------------------------------
  const addToRecent = useCallback((hymn) => {
    setRecentSearches((prev) => {
      const filtered = prev.filter((r) => r.number !== hymn.number);
      const next = [{ ...hymn, searchedAt: Date.now() }, ...filtered].slice(0, 10);
      api.saveSettings({ recentSearches: next }).catch(() => {});
      return next;
    });
  }, []);

  // Remove a recent search
  const removeRecent = useCallback((number) => {
    setRecentSearches((prev) => {
      const next = (prev || []).filter((r) => String(r.number) !== String(number));
      api.saveSettings({ recentSearches: next }).catch(() => {});
      return next;
    });
  }, []);

  // Send hymn to display (lower third / full screen) — Req #3 + #4.
  // Single PC: overlay window / OBS-vMix browser source. Two PCs: overlay
  // server URL opened on the second machine on the same network.
  const sendToDisplay = useCallback((hymn, mode) => {
    if (!hymn) return;
    setDisplayHymn(hymn);
    if (mode) {
      setDisplayMode(mode);
      api.saveSettings({ hymnDisplayMode: mode }).catch(() => {});
    }
    setDisplayOpen(true);
    addToRecent(hymn);
  }, [addToRecent]);

  // Init: load settings (churches, recents, display prefs) then provider
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await api.getSettings();
        if (cancelled) return;
        const savedChurches = settings?.churches ?? [];
        const current = settings?.currentChurch ?? savedChurches[0]?.id ?? null;
        churchesRef.current = JSON.stringify(savedChurches);
        setChurches(savedChurches);
        setCurrentChurchId(current);
        setRecentSearches(settings?.recentSearches ?? []);
        setDisplayMode(settings?.hymnDisplayMode ?? 'fullscreen');
        setTextColor(settings?.hymnTextColor ?? '#ffffff');
        setBgColor(settings?.hymnBgColor ?? '#0e1116');
        setBgImage(settings?.hymnBgImage ?? null);
        buildProvider(savedChurches, current);
      } catch (e) {
        if (!cancelled) setError({ message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [buildProvider]);

  // Keep the church list in sync with settings passed from the parent (e.g.
  // after a church is added or deleted in Settings and saved).
  useEffect(() => {
    if (!settings) return;
    const savedChurches = settings.churches ?? [];
    const nextJson = JSON.stringify(savedChurches);
    if (churchesRef.current !== nextJson) {
      churchesRef.current = nextJson;
      setChurches(savedChurches);
    }
    setCurrentChurchId((prev) => {
      const stillExists =
        prev != null && savedChurches.some((c) => String(c.id) === String(prev));
      if (stillExists) return prev;
      const next = settings.currentChurch ?? savedChurches[0]?.id ?? null;
      if (String(next) !== String(prev)) {
        setHymns([]);
        setPage(1);
        setSelectedHymn(null);
        setError(null);
      }
      return next;
    });
  }, [settings]);

  // Refresh churches when settings change externally (e.g. a church was
  // added/removed in Settings). Re-read on window focus and keep the selector
  // in sync, falling back to the first remaining church if the current one
  // was deleted.
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const settings = await api.getSettings();
        if (cancelled) return;
        const savedChurches = settings?.churches ?? [];
        const nextJson = JSON.stringify(savedChurches);
        if (churchesRef.current !== nextJson) {
          churchesRef.current = nextJson;
          setChurches(savedChurches);
        }
        setCurrentChurchId((prev) => {
          const stillExists =
            prev != null && savedChurches.some((c) => String(c.id) === String(prev));
          if (stillExists) return prev;
          const next = settings?.currentChurch ?? savedChurches[0]?.id ?? null;
          if (String(next) !== String(prev)) {
            setHymns([]);
            setPage(1);
            setSelectedHymn(null);
            setError(null);
          }
          return next;
        });
      } catch {
        // ignore refresh failures
      }
    };
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Load categories
  useEffect(() => {
    if (!provider) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await provider.getCategories();
        if (!cancelled) {
          if (res.ok) setCategories(res.data ?? []);
          else setError(res.error);
        }
      } catch (e) {
        if (!cancelled) setError({ message: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [provider]);

  // Load hymns — Req #2: search by title, number, lyric + category + paging
  const loadHymns = useCallback(async (opts = {}) => {
    if (!provider) return;
    const reset = opts.reset ?? true;
    const q = opts.q !== undefined ? opts.q : query;
    const cat = opts.category !== undefined ? opts.category : selectedCategory;
    const pageNum = reset ? 1 : (opts.page ?? page);
    setLoading(true);
    setError(null);
    try {
      const res = await provider.listHymns({
        page: pageNum,
        limit: 20,
        q: (q || '').trim() || undefined,
        category: cat || undefined,
      });
      if (res.ok) {
        const data = res.data ?? {};
        const list = data.hymns ?? data.items ?? data.results ?? [];
        setHymns((prev) => (reset ? list : [...prev, ...list]));
        setPage(pageNum + 1);
        const pagination = data.pagination ?? {};
        setHasMore(pagination.hasMore ?? list.length === 20);
        if ((q || '').trim()) {
          setRecentSearches((prev) => {
            const term = (q || '').trim();
            const filtered = (prev || []).filter((r) => (r.label || '') !== term);
            const next = [{ number: null, label: term, searchedAt: Date.now() }, ...filtered].slice(0, 10);
            api.saveSettings({ recentSearches: next }).catch(() => {});
            return next;
          });
        }
      } else {
        if (reset) setHymns([]);
        setError(res.error);
      }
    } catch (e) {
      setError({ message: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  }, [provider, page, query, selectedCategory]);

  const searchHymns = useCallback((term, pageNum = 1) => {
    const t = (term ?? '').trim();
    setQuery(t);
    setPage(pageNum);
    return loadHymns({ reset: pageNum === 1, q: t, page: pageNum });
  }, [loadHymns]);

  // Initial + reactive load when provider/category changes (not each keystroke)
  useEffect(() => {
    if (!provider) return;
    loadHymns({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, selectedCategory]);

  // Load single hymn lyrics
  const loadHymn = useCallback(async (number) => {
    if (!provider || number == null) return;
    setLyricsLoading(true);
    setSelectedHymn(null);
    setError(null);
    try {
      const res = await provider.getHymn(number);
      if (res.ok) {
        setSelectedHymn(res.data);
        addToRecent(res.data);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError({ message: String(e?.message || e) });
    } finally {
      setLyricsLoading(false);
    }
  }, [provider, addToRecent]);

  const handleChurchChange = async (e) => {
    const id = e.target.value;
    setCurrentChurchId(id);
    setHymns([]);
    setPage(1);
    setSelectedHymn(null);
    setError(null);
    api.saveSettings({ currentChurch: id }).catch(() => {});
  };

  const handleDeleteChurch = async () => {
    if (!currentChurchId) return;
    const target = churches.find((c) => String(c.id) === String(currentChurchId));
    const name = target?.name ?? target?.id ?? 'this church';
    if (!window.confirm(`Delete "${name}" from the hymn module?`)) return;
    const nextChurches = churches.filter(
      (c) => String(c.id) !== String(currentChurchId),
    );
    const nextCurrent = nextChurches[0]?.id ?? null;
    setChurches(nextChurches);
    setCurrentChurchId(nextCurrent);
    setHymns([]);
    setPage(1);
    setSelectedHymn(null);
    setError(null);
    try {
      await api.saveSettings({ churches: nextChurches, currentChurch: nextCurrent });
    } catch {
      // ignore
    }
  };

  const handleBgUpload = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || '');
      setBgImage(url);
      api.saveSettings({ hymnBgImage: url }).catch(() => {});
    };
    reader.readAsDataURL(file);
  }, []);

  const persistDisplayPrefs = useCallback((patch) => {
    api.saveSettings(patch).catch(() => {});
  }, []);

  // --------------------------------------------------------------------------
  // Render — early guard: no church configured
  // --------------------------------------------------------------------------
  if (!provider) {
    return (
      <div className="hymn__empty">
        <div className="hymn__empty__icon"><MdSettings size={24} /></div>
        <div className="hymn__empty__title">No church configured</div>
        <div className="hymn__empty__desc">
          Add a church with a Christ BC Hymn API key in Settings, then return
          here to browse hymns.
        </div>
        {onSettings && !compact && (
          <button
            className="btn btn--ghost btn--small"
            onClick={onSettings}
          >
            <MdSettings size={14} /> Open Settings
          </button>
        )}
        {onBack && (
          <button className="btn btn--primary" onClick={onBack}>
            Reselect modules
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`hymn__browser${compact ? ' hymn__browser--compact' : ''}`}>
      {/* Top bar — church selector + prominent search */}
      <header className="hymn__browser__top">
        {onBack && !compact && (
          <button className="btn btn--ghost btn--small" onClick={onBack}>
            <MdArrowBack size={14} /> Reselect modules
          </button>
        )}
        <div className="hymn__browser__top__meta">
          {churches.length > 0 && (
            <>
              <select
                className="hymn__browser__top__church"
                value={currentChurchId ?? ''}
                onChange={handleChurchChange}
              >
                {churches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                aria-label="Delete selected church"
                title="Delete selected church"
                onClick={handleDeleteChurch}
                disabled={!currentChurchId}
              >
                🗑️
              </button>
            </>
          )}
          <span className="hymn__browser__top__subtitle">
            {currentChurchId ? 'Hymns' : 'Select a church to begin'}
          </span>
        </div>
        <div className="hymn__browser__top__search">
          <input
            className="hymn__browser__top__search__input"
            placeholder="Search by title, number, lyric…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchHymns(query, 1)}
          />
          <button
            className="btn btn--primary btn--small"
            onClick={() => searchHymns(query, 1)}
            disabled={!query.trim() || loading}
          >
            Search
          </button>
          {onSettings && !compact && (
            <button
              className="btn btn--ghost btn--small"
              aria-label="Settings"
              title="Church & display settings"
              onClick={onSettings}
            >
              <MdSettings size={14} />
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="hymn__browser__error">
          {error.message}
          {error.retryable && (
            <button className="btn btn--small" onClick={() => loadHymns(true)}>
              Retry
            </button>
          )}
        </div>
      )}

      <div className="hymn__browser__body">
        <aside className="hymn__browser__sidebar">
          <div className="panel">
            <div className="panel__head">
              <h3 className="panel__title">Categories</h3>
              <button
                className="btn btn--ghost btn--small"
                onClick={() => setSelectedCategory(null)}
              >
                Clear
              </button>
            </div>
            {categories.length === 0 ? (
              <div className="hymn__empty__desc">No categories yet.</div>
            ) : (
              <ul className="hymn__browser__categories">
                <li
                  className={`hymn__browser__category ${
                    !selectedCategory ? 'is-active' : ''
                  }`}
                  onClick={() => setSelectedCategory(null)}
                >
                  All hymns
                </li>
                {categories.map((cat) => {
                  const label = typeof cat === 'string' ? cat : (cat?.name ?? cat?.title ?? String(cat));
                  const value = typeof cat === 'string' ? cat : (cat?.slug ?? cat?.name ?? label);
                  return (
                    <li
                      key={value}
                      className={`hymn__browser__category ${
                        selectedCategory === value ? 'is-active' : ''
                      }`}
                      onClick={() => setSelectedCategory(value)}
                    >
                      {label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Stage display prefs — Req #3 (lower third / fullscreen) + Req #5 (backgrounds) */}
          <div className="panel hymn__browser__displayprefs">
            <div className="panel__head">
              <h3 className="panel__title">Stage display</h3>
            </div>
            <label className="hymn__field">
              <span>Mode</span>
              <select
                value={displayMode}
                onChange={(e) => {
                  setDisplayMode(e.target.value);
                  persistDisplayPrefs({ hymnDisplayMode: e.target.value });
                }}
              >
                <option value="fullscreen">Full screen</option>
                <option value="lower">Lower third</option>
              </select>
            </label>
            <label className="hymn__field">
              <span>Text colour</span>
              <input
                type="color"
                value={textColor}
                onChange={(e) => {
                  setTextColor(e.target.value);
                  persistDisplayPrefs({ hymnTextColor: e.target.value });
                }}
              />
            </label>
            <label className="hymn__field">
              <span>Background colour</span>
              <input
                type="color"
                value={bgColor}
                onChange={(e) => {
                  setBgColor(e.target.value);
                  persistDisplayPrefs({ hymnBgColor: e.target.value });
                }}
              />
            </label>
            <label className="hymn__field">
              <span>Background image</span>
              <input type="file" accept="image/*" onChange={handleBgUpload} />
            </label>
            {bgImage && (
              <button
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setBgImage(null);
                  persistDisplayPrefs({ hymnBgImage: null });
                }}
              >
                Remove image
              </button>
            )}
            <div className="hymn__empty__desc">
              Tip: add the overlay URL as a Browser Source in OBS/vMix on the
              same PC, or open it on a second PC on the same network.
            </div>
          </div>
        </aside>

        <main className="hymn__browser__main">
          {/* Search results */}
          <section className="hymn__browser__results">
            {loading && (
              <div className="hymn__loading">Loading hymns…</div>
            )}
            {!loading && hymns.length === 0 && !error && (
              <div className="hymn__empty">
                <div className="hymn__empty__icon">🎵</div>
                <div className="hymn__empty__title">
                  {query.trim() ? 'No hymns found' : 'Loading hymns…'}
                </div>
                <div className="hymn__empty__desc">
                  {query.trim()
                    ? 'Try a different search term or category.'
                    : 'Browse the list below, or search by number, title or lyric.'}
                </div>
              </div>
            )}
            {hymns.map((h) => (
                  <div
                    key={h.number ?? h.id}
                    className="hymn__card"
                  >
                    <button
                      className="hymn__card__main"
                      onClick={() => loadHymn(h.number ?? h.id)}
                    >
                      <div className="hymn__card__number">{h.number ?? '—'}</div>
                      <div className="hymn__card__title">{h.title ?? 'Untitled'}</div>
                      {h.firstLine && (
                        <div className="hymn__card__line">{h.firstLine}</div>
                      )}
                      {h.author && (
                        <div className="hymn__card__author">by {h.author}</div>
                      )}
                    </button>
                    <div className="hymn__card__actions">
                      <button
                        className="btn btn--ghost btn--small"
                        onClick={() => sendToDisplay(h, 'lower')}
                      >
                        Lower third
                      </button>
                      <button
                        className="btn btn--ghost btn--small"
                        onClick={() => sendToDisplay(h, 'fullscreen')}
                      >
                        Full screen
                      </button>
                    </div>
                  </div>
                ))}
                {hasMore && loading === false && hymns.length > 0 && (
                  <button
                    className="btn btn--ghost btn--small"
                    onClick={() => loadHymns({ reset: false })}
                  >
                    Load more
                  </button>
                )}
          </section>
        </main>
        {/* Recent searches — full-width bottom rail spanning both columns */}
        <div className="hymn__browser__recent-bottom">
          <div className="panel hymn__browser__recent">
            <div className="panel__head">
              <h3 className="panel__title">Recent searches (up to 10)</h3>
              <button
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setRecentSearches([]);
                  api.saveSettings({ recentSearches: [] }).catch(() => {});
                }}
              >
                Clear
              </button>
            </div>
            {recentSearches.length === 0 ? (
              <div className="hymn__empty__desc">Nothing recent yet.</div>
            ) : (
              <ul className="hymn__browser__recent__list">
                {recentSearches.map((r) => (
                  <li key={String(r.number ?? r.label)}>
                    <button
                      className="hymn__browser__recent__item"
                      onClick={() => {
                        if (r.number != null) loadHymn(r.number);
                        else searchHymns(String(r.label || ''), 1);
                      }}
                      title={`Open ${r.label}`}
                    >
                      <span className="hymn__browser__recent__item__num">
                        {r.number != null ? `#${r.number}` : '🔍'}
                      </span>
                      <span className="hymn__browser__recent__item__label">
                        {r.label}
                      </span>
                    </button>
                    <button
                      className="btn btn--ghost btn--small"
                      aria-label={`Remove ${r.label}`}
                      onClick={() => removeRecent(r.number ?? r.label)}
                    >
                      <MdClose size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Lyrics panel (slides in from right, EasyWorship-style) */}
      {selectedHymn && (
        <div className="hymn__lyrics">
          <button
            className="hymn__lyrics__close"
            aria-label="Close lyrics"
            onClick={() => setSelectedHymn(null)}
          >
            <MdClose size={14} />
          </button>
          <div className="hymn__lyrics__header">
            <div className="hymn__lyrics__number">{selectedHymn.number ?? '—'}</div>
            <h1 className="hymn__lyrics__title">{selectedHymn.title ?? 'Untitled'}</h1>
            {selectedHymn.author && (
              <div className="hymn__lyrics__author">by {selectedHymn.author}</div>
            )}
          </div>
          <div className="hymn__lyrics__body">
            {lyricsLoading ? (
              <div className="hymn__loading">Loading verses…</div>
            ) : (
              <div className="hymn__lyrics__verses">
                {renderVerses(selectedHymn)}
              </div>
            )}
          </div>
          <div className="hymn__lyrics__footer">
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
      )}

      {/* Display overlay — Req #3 fullscreen/lower + Req #4 OBS/vMix/2-PC */}
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
                  setDisplayMode('fullscreen');
                  persistDisplayPrefs({ hymnDisplayMode: 'fullscreen' });
                }}
              >
                Full screen
              </button>
              <button
                className={`btn btn--small ${displayMode === 'lower' ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => {
                  setDisplayMode('lower');
                  persistDisplayPrefs({ hymnDisplayMode: 'lower' });
                }}
              >
                Lower third
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Render hymn verses. The provider returns a `verses` array (or a `lyrics`
 * string). We normalise both into verse blocks for clean, line-by-line
 * display — EasyWorship shows one verse at a time, but we keep all verses
 * visible for quick scanning while staying light.
 */
function renderVerses(hymn) {
  const verses =
    Array.isArray(hymn.verses) && hymn.verses.length > 0
      ? hymn.verses
      : hymn.lyrics
        ? String(hymn.lyrics).split(/\n\s*\n/).filter(Boolean)
        : [];

  if (verses.length === 0) {
    return <div className="hymn__lyrics__none">No verse text available.</div>;
  }

  return verses.map((v, i) => {
    const lines = Array.isArray(v) ? v : String(v).split('\n').filter(Boolean);
    return (
      <div key={i} className="hymn__verse">
        {lines.length > 1 && (
          <div className="hymn__verse__label">Verse {i + 1}</div>
        )}
        {lines.map((line, j) => (
          <div key={j} className="hymn__verse__line">
            {line}
          </div>
        ))}
      </div>
    );
  });
}
