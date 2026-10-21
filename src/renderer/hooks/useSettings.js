// Load settings once, expose a patch-saver, and keep local state in sync.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

export function useSettings() {
  const [settings, setSettings] = useState({});

  useEffect(() => {
    api.getSettings().then(setSettings);
  }, []);

  const save = useCallback(async (patch) => {
    const next = await api.saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  return { settings, save };
}
