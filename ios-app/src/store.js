import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  articleKey,
  clearUserData,
  loadFeed,
  loadSaved,
  loadSeen,
  loadSettings,
  persistSaved,
  persistSeen,
  persistSettings,
} from "./data";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }) {
  const [feed, setFeed] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [seen, setSeen] = useState(() => new Set());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persistSettings(next);
      return next;
    });
  }, []);

  const clearData = useCallback(async () => {
    await clearUserData();
    setSaved([]);
    setSeen(new Set());
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await loadFeed();
      setFeed(r.feed);
      setOffline(r.offline);
      setError(null);
    } catch (e) {
      setError(e.message || "Could not load articles");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    loadSaved().then(setSaved);
    loadSeen().then((k) => setSeen(new Set(k)));
    loadSettings().then(setSettings);
  }, [refresh]);

  const savedKeys = useMemo(() => new Set(saved.map(articleKey)), [saved]);

  const toggleSave = useCallback((a) => {
    setSaved((prev) => {
      const k = articleKey(a);
      const next = prev.some((x) => articleKey(x) === k) ? prev.filter((x) => articleKey(x) !== k) : [a, ...prev];
      persistSaved(next);
      return next;
    });
  }, []);

  const markSeen = useCallback((a) => {
    setSeen((prev) => {
      const k = articleKey(a);
      if (prev.has(k)) return prev;
      const next = new Set(prev);
      next.add(k);
      persistSeen([...next]);
      return next;
    });
  }, []);

  const value = { settings, updateSettings, clearData, seen, markSeen, feed, offline, error, refreshing, refresh, saved, savedKeys, toggleSave };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
