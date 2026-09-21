// Die Social-Accounts eines Kunden bearbeiten.
// ---------------------------------------------------------------------------
// Beliebig viele Instagram- und TikTok-Accounts je Kunde. Der Normalfall
// bleibt einer pro Plattform -- fuer Kunden mit zwei Betrieben (zusammen-
// gelegte Kunden, Zweitmarken) kommt einfach eine Zeile dazu.
//
// Der oberste Account einer Plattform ist der Hauptaccount. Er ist das, was
// ueberall dort auftaucht, wo nur Platz fuer einen ist (Kundenliste, Suche,
// KI-Briefing).

import { PLATTFORMEN, accountName, normHandle, type AccountEntwurf, type Plattform } from '../lib/accounts'
import type { ChannelEntwurf } from '../lib/channels'

export default function AccountsEditor({
  entwuerfe,
  onChange,
  kanaele,
}: {
  entwuerfe: AccountEntwurf[]
  onChange: (next: AccountEntwurf[]) => void
  /** Die Kanäle des Kunden. Leer = keine Trennung, dann gibt es kein Feld. */
  kanaele: ChannelEntwurf[]
}) {
  function setze(i: number, patch: Partial<AccountEntwurf>) {
    onChange(entwuerfe.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  }

  function raus(i: number) {
    onChange(entwuerfe.filter((_, j) => j !== i))
  }

  function dazu(platform: Plattform) {
    onChange([...entwuerfe, { id: null, platform, handle: '', label: '' }])
  }

  // Doppelte Handles blockieren das Speichern (die Datenbank laesst sie
  // nicht zu). Lieber gleich hier zeigen, statt hinterher eine kryptische
  // Fehlermeldung.
  const zaehler = new Map<string, number>()
  for (const e of entwuerfe) {
    const h = normHandle(e.handle)
    if (!h) continue
    const k = e.platform + '|' + h
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1)
  }

  const mehrfach = entwuerfe.filter((e) => e.platform === 'instagram').length > 1
    || entwuerfe.filter((e) => e.platform === 'tiktok').length > 1

  // Gibt es Kanäle, wird der Account einem zugeordnet statt frei beschriftet.
  // Der Kanalname IST die Beschriftung -- zwei Felder fuer dieselbe Sache
  // waeren nur eine Quelle fuer Widersprueche.
  const kanalWahl = kanaele.filter((k) => k.name.trim() !== '')

  return (
    <div className="acc-editor">
      <label>Social-Accounts</label>

      {entwuerfe.length === 0 && (
        <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
          Noch kein Account hinterlegt. Ohne Handle holen wir keine Follower-Zahlen.
        </p>
      )}

      <div className="acc-liste">
        {entwuerfe.map((e, i) => {
          const info = PLATTFORMEN.find((p) => p.wert === e.platform)!
          const h = normHandle(e.handle)
          const doppelt = h !== '' && (zaehler.get(e.platform + '|' + h) ?? 0) > 1
          // Der erste Eintrag je Plattform ist der Hauptaccount.
          const haupt = entwuerfe.findIndex((x) => x.platform === e.platform) === i
          return (
            <div className={`acc-zeile ${doppelt ? 'doppelt' : ''}`} key={i}>
              <span className="acc-icon" title={info.name}>{info.icon}</span>
              <div className="acc-felder">
                <input
                  className="acc-handle"
                  value={e.handle}
                  onChange={(ev) => setze(i, { handle: ev.target.value })}
                  placeholder={info.name + '-Handle'}
                  aria-label={info.name + '-Handle'}
                />
                {kanalWahl.length > 0 ? (
                  <select
                    className="acc-label"
                    value={kanalWahl.some((k) => k.name === e.label) ? e.label : ''}
                    onChange={(ev) => setze(i, { label: ev.target.value })}
                    aria-label="Kanal des Accounts"
                  >
                    <option value="">— kein Kanal —</option>
                    {kanalWahl.map((k) => (
                      <option key={k.name} value={k.name}>{k.name}</option>
                    ))}
                  </select>
                ) : mehrfach ? (
                  <input
                    className="acc-label"
                    value={e.label}
                    onChange={(ev) => setze(i, { label: ev.target.value })}
                    placeholder="Name (z. B. Filiale)"
                    aria-label="Name des Accounts"
                  />
                ) : null}
              </div>
              {/* Immer gerendert, nur unsichtbar -- sonst waeren die Felder
                  der Zeilen ohne Kennzeichen breiter und nichts fluchtet. */}
              {(mehrfach || kanalWahl.length > 0) && (
                <span className={`acc-haupt ${haupt ? '' : 'leer'}`} aria-hidden={!haupt} title={haupt ? 'Steht überall dort, wo nur einer Platz hat' : undefined}>
                  Haupt
                </span>
              )}
              <button type="button" className="acc-weg" onClick={() => raus(i)} aria-label={`${accountName({ label: e.label, handle: h || '…' })} entfernen`}>
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div className="acc-dazu">
        {PLATTFORMEN.map((p) => (
          <button type="button" key={p.wert} className="btn btn-sm btn-ghost" onClick={() => dazu(p.wert)}>
            ＋ {p.icon} {p.name}
          </button>
        ))}
      </div>

      {[...zaehler.values()].some((n) => n > 1) && (
        <p className="acc-warn">Ein Handle steht doppelt drin — das geht nicht.</p>
      )}

      {mehrfach && (
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Mehrere Accounts: Die Follower werden für diesen Kunden <strong>addiert</strong>.
          Unter „Wachstum" siehst du trotzdem, welcher Account wie läuft.
        </p>
      )}
    </div>
  )
}
