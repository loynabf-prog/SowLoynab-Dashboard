// Schneller Tab-Wechsel: Seiten merken sich ihre zuletzt geladenen Daten.
// ---------------------------------------------------------------------------
// Kommt man auf eine Seite zurueck, steht sofort der letzte Stand da und wird
// im Hintergrund aufgefrischt -- statt jedes Mal "Lade …". Nur im Speicher
// dieses Tabs, nicht dauerhaft.

import { useCallback, useState } from 'react'

const speicher = new Map<string, unknown>()

export function istGemerkt(key: string): boolean {
  return speicher.has(key)
}

/** Wie useState, aber der Wert ueberlebt das Verlassen der Seite. */
export function useGemerkt<T>(key: string, start: T): [T, (v: T | ((alt: T) => T)) => void] {
  const [wert, setWert] = useState<T>(() => (speicher.has(key) ? (speicher.get(key) as T) : start))
  const setze = useCallback((v: T | ((alt: T) => T)) => {
    setWert((alt) => {
      const neu = typeof v === 'function' ? (v as (a: T) => T)(alt) : v
      speicher.set(key, neu)
      return neu
    })
  }, [key])
  return [wert, setze]
}

/** Alles vergessen (z. B. beim Abmelden oder nach "Alles aktualisieren"). */
export function allesVergessen(): void {
  speicher.clear()
}
