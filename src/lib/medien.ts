// Medien aus Dropbox -- die Aufrufe an die Edge Function "dropbox-media"
// und ein paar reine Helfer fuer die Anzeige.
//
// Die Dateien liegen nie in Supabase. Was hier verschoben wird, ist in
// Dropbox verschoben: es gibt nur einen Bestand.

import { rufeFunktion } from './funktion'

export const BASIS = '/Sow & Loynab Media'
/** Hintergrund: gepostete Videos, Projekte, uebriges Drehmaterial (online-only, seit 28.10.2026) */
export const ARCHIV = '/Sow & Loynab Archiv'

export interface Eintrag {
  name: string
  pfad: string
  ordner: boolean
  art: 'ordner' | 'video' | 'bild' | 'datei'
  groesse: number | null
  geaendert: string | null
}

export interface DropboxStatus { appEingerichtet: boolean; verbunden: boolean; konto: string | null }

const rufe = <T>(action: string, rest: Record<string, unknown> = {}) =>
  rufeFunktion<T>('dropbox-media', { action, ...rest })

export const dropbox = {
  status: () => rufe<DropboxStatus>('status'),
  authUrl: () => rufe<{ url: string }>('auth-url'),
  verbinden: (code: string) => rufe<{ ok: boolean; konto: string | null }>('connect', { code }),
  liste: (pfad: string) => rufe<{ eintraege: Eintrag[] }>('list', { pfad }).then((r) => r.eintraege),
  ordner: (pfad: string) => rufe<{ ordner: string[] }>('folders', { pfad }).then((r) => r.ordner),
  vorschauen: (pfade: string[]) =>
    rufe<{ vorschauen: { pfad: string; bild: string | null }[] }>('thumbs', { pfade }).then((r) => r.vorschauen),
  link: (pfad: string) => rufe<{ url: string }>('link', { pfad }).then((r) => r.url),
  suche: (query: string, pfad: string) => rufe<{ eintraege: Eintrag[] }>('search', { query, pfad }).then((r) => r.eintraege),
  verschieben: (pfade: string[], nach: string) =>
    rufe<{ ergebnis: { pfad: string; ok: boolean; neu?: string; fehler?: string }[] }>('move', { pfade, nach }).then((r) => r.ergebnis),
  /** An einen genauen Zielpfad (auch mit neuem Namen) verschieben. */
  umbenennen: (von: string, nach: string) => rufe<{ neu: string }>('rename', { von, nach }).then((r) => r.neu),
}

/** Ordner zuerst, dann nach Name -- Drehtag-Ordner ("2026-10_...") neueste oben. */
export function sortiert(liste: Eintrag[]): Eintrag[] {
  return [...liste].sort((a, b) => {
    if (a.ordner !== b.ordner) return a.ordner ? -1 : 1
    const da = /^\d{4}-\d{2}/.test(a.name)
    const db = /^\d{4}-\d{2}/.test(b.name)
    if (a.ordner && da && db) return b.name.localeCompare(a.name)
    return a.name.localeCompare(b.name, 'de', { numeric: true })
  })
}

/** Brotkrumen von einem Startordner bis zum aktuellen Pfad. */
export function brotkrumen(start: string, aktuell: string): { name: string; pfad: string }[] {
  const out = [{ name: start.split('/').pop() || start, pfad: start }]
  if (!aktuell.toLowerCase().startsWith(start.toLowerCase())) return out
  const rest = aktuell.slice(start.length).split('/').filter(Boolean)
  let p = start
  for (const teil of rest) {
    p = `${p}/${teil}`
    out.push({ name: teil, pfad: p })
  }
  return out
}

export function groesse(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

/** Pfad relativ zum Kundenordner -- fuer den Ordner-Waehler. */
export function relativ(start: string, pfad: string): string {
  if (pfad.toLowerCase() === start.toLowerCase()) return '/'
  return pfad.toLowerCase().startsWith(start.toLowerCase() + '/') ? pfad.slice(start.length + 1) : pfad
}

/** Link zum Ordner in der Dropbox-Weboberflaeche. */
export function dropboxWebLink(pfad: string): string {
  return 'https://www.dropbox.com/home' + pfad.split('/').map(encodeURIComponent).join('/')
}
