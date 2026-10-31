import { useEffect } from "react";
import { articleKey } from "./data";
import Detail from "./Detail";
import ErrorBoundary from "./ErrorBoundary";
import { useStore } from "./store";

// One article page, marked as read when shown. Used full-screen on iPhone and as the right pane on iPad.
export default function DetailPane({ article }) {
  const { savedKeys, toggleSave, markSeen } = useStore();
  useEffect(() => {
    markSeen(article);
  }, [article, markSeen]);
  return (
    <ErrorBoundary key={articleKey(article)}>
      <Detail article={article} saved={savedKeys.has(articleKey(article))} onToggleSave={toggleSave} />
    </ErrorBoundary>
  );
}
