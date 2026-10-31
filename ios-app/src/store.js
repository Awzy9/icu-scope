import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  articleKey,
  clearUserData,
  loadCollections,
  loadFeed,
  loadSaved,
  loadSeen,
  loadSettings,
  persistCollections,
  persistSaved,
  persistSeen,
  persistSettings,
} from "./data";
import { usePersonal } from "./personal";

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }) {
  const [feed, setFeed] = useState(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState([]);
  const [refreshing, setRefreshing] = useState(true);
  const [seen, setSeen] = useState(() => new Set());
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [collections, setCollections] = useState([]);
  const personal = usePersonal();
  const { recordRead, resetPersonal } = personal;

  const updateCollections = useCallback((change) => {
    setCollections((prev) => {
      const next = change(prev);
      persistCollections(next);
      return next;
    });
  }, []);

  const createCollection = useCallback(
    (name) => {
      const id = `c${Date.now().toString(36)}`;
      updateCollections((prev) => [...prev, { id, name: name.trim(), keys: [] }]);
      return id;
    },
    [updateCollections],
  );

  const deleteCollection = useCallback(
    (id) => updateCollections((prev) => prev.filter((c) => c.id !== id)),
    [updateCollections],
  );

  const toggleInCollection = useCallback(
    (id, key) =>
      updateCollections((prev) =>
        prev.map((c) =>
          c.id !== id ? c : { ...c, keys: c.keys.includes(key) ? c.keys.filter((k) => k !== key) : [...c.keys, key] },
        ),
      ),
    [updateCollections],
  );

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
    setCollections([]);
    resetPersonal();
  }, [resetPersonal]);

  const load = useCallback(async () => {
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    return load();
  }, [load]);

  // `refreshing` starts true, so the first load needs no synchronous state change here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; state is only set after the awaited fetch
    load();
    loadSaved().then(setSaved);
    loadSeen().then((k) => setSeen(new Set(k)));
    loadSettings().then((s) => {
      setSettings(s);
      setReady(true);
    });
    loadCollections().then(setCollections);
  }, [load]);

  const savedKeys = useMemo(() => new Set(saved.map(articleKey)), [saved]);

  const toggleSave = useCallback((a) => {
    setSaved((prev) => {
      const k = articleKey(a);
      const next = prev.some((x) => articleKey(x) === k) ? prev.filter((x) => articleKey(x) !== k) : [a, ...prev];
      persistSaved(next);
      return next;
    });
  }, []);

  const markSeen = useCallback(
    (a) => {
      recordRead(a);
      setSeen((prev) => {
        const k = articleKey(a);
        if (prev.has(k)) return prev;
        const next = new Set(prev);
        next.add(k);
        persistSeen([...next]);
        return next;
      });
    },
    [recordRead],
  );

  const markUnread = useCallback((a) => {
    setSeen((prev) => {
      const k = articleKey(a);
      if (!prev.has(k)) return prev;
      const next = new Set(prev);
      next.delete(k);
      persistSeen([...next]);
      return next;
    });
  }, []);

  const markAllSeen = useCallback((list) => {
    setSeen((prev) => {
      const next = new Set(prev);
      list.forEach((a) => next.add(articleKey(a)));
      persistSeen([...next]);
      return next;
    });
  }, []);

  const value = {
    ...personal,
    ready,
    collections,
    createCollection,
    deleteCollection,
    toggleInCollection,
    markUnread,
    markAllSeen,
    settings, updateSettings, clearData, seen, markSeen, feed, offline, error, refreshing, refresh, saved, savedKeys, toggleSave,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
