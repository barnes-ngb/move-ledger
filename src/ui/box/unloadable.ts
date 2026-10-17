import { useCallback, useState } from "react";
import { useOnline } from "../../hooks/useOnline";

/**
 * Image sources that would not load on this phone, so the strip and the viewer
 * can say so instead of drawing a broken image.
 *
 * The usual case is a photo that uploaded, was never opened on this phone, and
 * is asked for with no signal: its local blob is gone, the download URL needs
 * the network, and the service worker has no copy because nothing ever fetched
 * one. Doc 04 section 9.
 *
 * Keyed by source rather than by photo, so a photo whose source changes is
 * tried again. Forgotten when the network comes back, so a photo that failed
 * in the basement is tried again in the driveway. A failure with the browser
 * already reporting a network, behind a captive portal or on a passing Storage
 * error, raises no such event, so `retry` forgets one source on a tap.
 */
export function useUnloadable(): {
  failed: (src: string) => boolean;
  mark: (src: string) => void;
  retry: (src: string) => void;
  online: boolean;
} {
  const online = useOnline();
  const [sources, setSources] = useState<ReadonlySet<string>>(() => new Set());
  const [wasOnline, setWasOnline] = useState(online);
  if (online !== wasOnline) {
    setWasOnline(online);
    if (online && sources.size > 0) setSources(new Set());
  }
  const failed = useCallback((src: string) => sources.has(src), [sources]);
  const mark = useCallback((src: string) => {
    setSources((prev) => (prev.has(src) ? prev : new Set(prev).add(src)));
  }, []);
  const retry = useCallback((src: string) => {
    setSources((prev) => {
      if (!prev.has(src)) return prev;
      const next = new Set(prev);
      next.delete(src);
      return next;
    });
  }, []);
  return { failed, mark, retry, online };
}
