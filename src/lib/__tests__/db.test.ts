import { describe, expect, it } from 'vitest'
import { dbKlartext, tableMissing } from '../db'

describe('tableMissing', () => {
  it('erkennt die echte Supabase-Meldung und den Tabellennamen', () => {
    expect(tableMissing({ message: "Could not find the table 'public.inspirations' in the schema cache" })).toBe('inspirations')
    expect(tableMissing({ message: 'relation "public.inspirations" does not exist' })).toBe('inspirations')
  })
  it('schlaegt bei fehlenden SPALTEN nicht an — die werden anders behandelt', () => {
    expect(tableMissing({ message: "Could not find the 'due_time' column of 'tasks' in the schema cache" })).toBeNull()
    expect(tableMissing({ message: 'column videos.views_ig does not exist' })).toBeNull()
  })
  it('ignoriert alles andere', () => {
    expect(tableMissing({ message: 'duplicate key value violates unique constraint' })).toBeNull()
    expect(tableMissing(null)).toBeNull()
  })
})

describe('dbKlartext', () => {
  it('nennt das SQL-Skript, das noch fehlt', () => {
    const t = dbKlartext("Could not find the table 'public.inspirations' in the schema cache")
    expect(t).toContain('ALLES_offen_20-23.sql')
    expect(t).not.toContain('schema cache')
  })
  it('laesst unbekannte Meldungen unveraendert', () => {
    expect(dbKlartext('irgendein anderer Fehler')).toBe('irgendein anderer Fehler')
  })
})
