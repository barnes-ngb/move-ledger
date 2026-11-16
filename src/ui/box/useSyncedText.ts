import { useState } from "react";

/**
 * A text field over a stored value: it follows the stored value while the
 * field is untouched, and keeps what is being typed once it is not. The same
 * shape box detail uses for its contents and weight fields, as a hook so the
 * three dimension fields do not repeat it three times.
 */
export function useSyncedText(stored: string): [string, (v: string) => void] {
  const [text, setText] = useState(stored);
  const [last, setLast] = useState(stored);
  if (stored !== last) {
    setLast(stored);
    if (text === last) setText(stored);
  }
  return [text, setText];
}
