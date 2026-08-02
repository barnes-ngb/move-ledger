import { useEffect, useState } from "react";

/**
 * Connectivity as the browser reports it. This is not Firestore's sync state,
 * which the SDK does not expose. It is honest about what it knows: whether
 * the device has a network, not whether every write has landed.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}
