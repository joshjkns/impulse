import type { PersistStorage, StorageValue } from 'zustand/middleware'

/**
 * localStorage for zustand `persist`, with writes deferred and coalesced.
 *
 * The stock JSON storage stringifies and writes the whole store synchronously on every `set` — for the chat
 * store that's every streamed token, for layouts every resize frame. Here a write only remembers the latest
 * value; serialisation happens once things go quiet (or before the page unloads), off the hot path.
 */
const pending = new Map<string, unknown>()
let timer: ReturnType<typeof setTimeout> | undefined

function flush() {
  timer = undefined
  for (const [name, value] of pending) {
    try {
      localStorage.setItem(name, JSON.stringify(value))
    } catch {
      /* quota or private mode: keep running in memory */
    }
  }
  pending.clear()
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
}

/** Writes land at most once per `delayMs`, so a long stream still saves as it goes. */
export function deferredStorage<S>(delayMs = 1000): PersistStorage<S> {
  return {
    getItem(name) {
      if (pending.has(name)) return pending.get(name) as StorageValue<S>
      try {
        const raw = localStorage.getItem(name)
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null
      } catch {
        return null
      }
    },
    setItem(name, value) {
      pending.set(name, value)
      timer ??= setTimeout(flush, delayMs)
    },
    removeItem(name) {
      pending.delete(name)
      try {
        localStorage.removeItem(name)
      } catch {
        /* ignore */
      }
    },
  }
}
