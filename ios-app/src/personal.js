import { useCallback, useEffect, useRef, useState } from "react";
import { KEYS, articleKey, loadJson, saveJson } from "./data";
import { logEntry, newCard, reviewCard } from "./studyTools";

const NO_OBJECT = {};
const NO_LIST = [];

// State that loads from AsyncStorage once and writes back shortly after the last change
// (debounced, so typing a note doesn't rewrite storage on every keystroke).
function usePersisted(key, initial) {
  const [value, setValue] = useState(initial);
  const timer = useRef(null);
  const latest = useRef(initial);
  useEffect(() => {
    loadJson(key, initial).then(setValue);
  }, [key, initial]);
  const update = useCallback(
    (change) =>
      setValue((prev) => {
        const next = change(prev);
        latest.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => saveJson(key, latest.current), 300);
        return next;
      }),
    [key],
  );
  return [value, update];
}

// Notes, reading log, keyword watchlist and flashcard deck. All stay on the device.
export function usePersonal() {
  const [notes, updateNotes] = usePersisted(KEYS.notes, NO_OBJECT);
  const [log, updateLog] = usePersisted(KEYS.log, NO_OBJECT);
  const [watchlist, updateWatch] = usePersisted(KEYS.watch, NO_LIST);
  const [deck, updateDeck] = usePersisted(KEYS.deck, NO_OBJECT);

  const setNote = useCallback(
    (article, text) =>
      updateNotes((prev) => {
        const key = articleKey(article);
        const next = { ...prev };
        if (text.trim()) next[key] = { text, at: Date.now(), article };
        else delete next[key];
        return next;
      }),
    [updateNotes],
  );

  // Keeps the first read of each article, so the log survives the feed rotating.
  const recordRead = useCallback(
    (article) =>
      updateLog((prev) => {
        const key = articleKey(article);
        return prev[key] ? prev : { ...prev, [key]: logEntry(article) };
      }),
    [updateLog],
  );

  const addWatch = useCallback(
    (query) => {
      const q = query.trim();
      if (!q) return;
      updateWatch((prev) =>
        prev.some((w) => w.query.toLowerCase() === q.toLowerCase()) ? prev : [...prev, { id: `w${Date.now().toString(36)}`, query: q }],
      );
    },
    [updateWatch],
  );
  const removeWatch = useCallback((id) => updateWatch((prev) => prev.filter((w) => w.id !== id)), [updateWatch]);

  const addCards = useCallback(
    (articles) =>
      updateDeck((prev) => {
        const next = { ...prev };
        articles.forEach((a) => {
          const key = articleKey(a);
          if (!next[key]) next[key] = { ...newCard(), article: a };
        });
        return next;
      }),
    [updateDeck],
  );
  const removeCard = useCallback(
    (key) =>
      updateDeck((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      }),
    [updateDeck],
  );
  const gradeCard = useCallback(
    (key, grade) => updateDeck((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], ...reviewCard(prev[key], grade) } } : prev)),
    [updateDeck],
  );

  const resetPersonal = useCallback(() => {
    updateNotes(() => NO_OBJECT);
    updateLog(() => NO_OBJECT);
    updateWatch(() => NO_LIST);
    updateDeck(() => NO_OBJECT);
  }, [updateNotes, updateLog, updateWatch, updateDeck]);

  return { notes, setNote, log, recordRead, watchlist, addWatch, removeWatch, deck, addCards, removeCard, gradeCard, resetPersonal };
}
