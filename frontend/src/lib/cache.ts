// Lightweight stale-while-revalidate cache backed by localStorage.
// Entries are scoped by a key the caller chooses — typically `user:db` —
// so signing in as a different user never reads stale rows.

const PREFIX = 'cache:';

export function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota / serialization — ignore, cache is best-effort */
  }
}

export function clearCache(prefix?: string): void {
  const full = PREFIX + (prefix ?? '');
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(full)) localStorage.removeItem(k);
  }
}
