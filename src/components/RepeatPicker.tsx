import { occurrences, mondayDow, WEEKDAYS_SHORT, type RepeatRule } from '../lib/recurrence'

// Kompakte Wiederholungs-Auswahl für Aufgaben & Videos.
export default function RepeatPicker({
  value,
  onChange,
  anchor,
}: {
  value: RepeatRule
  onChange: (r: RepeatRule) => void
  anchor: string // Startdatum ISO (kann leer sein)
}) {
  const set = (patch: Partial<RepeatRule>) => onChange({ ...value, ...patch })

  function toggleWeekday(w: number) {
    const cur = value.weekdays ?? []
    const next = cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w].sort((a, b) => a - b)
    set({ weekdays: next })
  }

  const dates = anchor && value.kind !== 'none' ? occurrences(anchor, value) : []
  const dFmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })

  return (
    <div className="repeat">
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label>Wiederholen</label>
          <select value={value.kind} onChange={(e) => {
            const kind = e.target.value as RepeatRule['kind']
            if (kind === 'weekly' && !(value.weekdays && value.weekdays.length) && anchor) {
              set({ kind, weekdays: [mondayDow(new Date(anchor + 'T00:00:00'))] })
            } else set({ kind })
          }}>
            <option value="none">Einmalig</option>
            <option value="days">Alle N Tage</option>
            <option value="weekly">Wöchentlich (Wochentage)</option>
            <option value="monthly">Monatlich</option>
          </select>
        </div>

        {value.kind === 'days' && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>Alle … Tage</label>
            <input value={String(value.interval ?? 3)} inputMode="numeric"
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
        )}
        {value.kind === 'monthly' && (
          <div style={{ flex: 1, minWidth: 120 }}>
            <label>Alle … Monate</label>
            <input value={String(value.interval ?? 1)} inputMode="numeric"
              onChange={(e) => set({ interval: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
        )}
      </div>

      {value.kind === 'weekly' && (
        <div style={{ marginTop: 10 }}>
          <label>An welchen Tagen</label>
          <div className="wd-chips">
            {WEEKDAYS_SHORT.map((lbl, w) => (
              <button type="button" key={w}
                className={`wd-chip ${(value.weekdays ?? []).includes(w) ? 'on' : ''}`}
                onClick={() => toggleWeekday(w)}>{lbl}</button>
            ))}
          </div>
        </div>
      )}

      {value.kind !== 'none' && (
        <>
          <div style={{ marginTop: 10, maxWidth: 240 }}>
            <label>Enddatum <span className="muted">(leer = unbegrenzt)</span></label>
            <input type="date" value={value.until ?? ''} onChange={(e) => set({ until: e.target.value || null })} />
          </div>
          <div className="repeat-preview">
            {!anchor ? (
              <span className="muted">Bitte oben ein Startdatum wählen.</span>
            ) : dates.length === 0 ? (
              <span className="muted">Keine Termine — Auswahl prüfen.</span>
            ) : (
              <>
                <strong>≈ {dates.length} Termine</strong>{' '}
                <span className="muted">
                  {dFmt(dates[0])} → {dFmt(dates[dates.length - 1])}{!value.until ? ' (unbegrenzt — erstmal 3 Monate)' : ''}
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
