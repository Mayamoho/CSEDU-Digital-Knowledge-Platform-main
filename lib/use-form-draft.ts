"use client";

import { useEffect, useState } from "react";

/**
 * Persists a form's text fields to localStorage so navigating away mid-fill and
 * coming back keeps the entries. File objects are not serializable and are not
 * persisted — only the plain-text state passed in `values`.
 *
 * Restore runs once on mount; save runs whenever `values` changes (after the
 * initial restore). Call clearFormDraft(key) after a successful submit.
 */
export function useFormDraft<T extends Record<string, unknown>>(
  key: string,
  values: T,
  restore: (draft: Partial<T>) => void,
  enabled = true,
) {
  const [hydrated, setHydrated] = useState(false);

  // Restore once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) restore(JSON.parse(raw) as Partial<T>);
    } catch {
      /* ignore malformed/unavailable storage */
    }
    setHydrated(true);
    // Restore only on key change; setters/values are intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Save on change, but only after the initial restore so we never clobber a
  // saved draft with the default state before it is applied.
  useEffect(() => {
    if (!hydrated || !enabled) return;
    try {
      localStorage.setItem(key, JSON.stringify(values));
    } catch {
      /* ignore quota/unavailable storage */
    }
  }, [key, values, hydrated, enabled]);
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
