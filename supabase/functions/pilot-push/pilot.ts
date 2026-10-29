// Der Pilot: das CRM entscheidet selbst, was als Naechstes dran ist.
// ---------------------------------------------------------------------------
// Bisher zeigte das CRM, was DA ist (Videos, Zahlen, Termine). Der Pilot
// rechnet daraus, was FEHLT -- und zwar bevor es brennt:
//
//   Monat        Wo steht jeder Kunde gegen sein Monatsziel, und wo waere er
//                nach Plan? ("Hajo: 0 von 15 -- nach Plan waeren es 9")
//   Vorrat       Reicht das, was in der Backstube liegt (Teller, Ofen,
//                Zutaten), fuer die naechsten 30 Tage? Sonst: Drehtag.
//   Ideen        Reichen die Ideen fuer den naechsten Drehtag? Sonst: Ideen.
//   Fluss        Fertige Videos ohne Posting-Tag? Pizzen unter der Lampe?
//                Ofen leer, obwohl Material da ist?
//   Pflege       Links, Zahlen, Rechnung des Vormonats, lange Pausen,
//                auslaufende Vertraege.
//   Lernen       Ein Video laeuft doppelt so gut wie sonst? Mehr davon.
//
// Reine Rechenlogik ohne Datenbank: die Zahlen kommen aus der Sicht
// pilot_kunden (Migration 0068), die App und der Morgen-Push (Edge Function
// pilot-push) lesen dieselbe Sicht. Jede Empfehlung hat genau EINE Aktion.

// ACHTUNG: Kopie von src/lib/pilot.ts fuer Deno -- nach jeder Aenderung dort
// neu erzeugen: npm run pilot:sync. Nur die zwei Imports sind hier inline.
function datumPlus(iso: string, tage: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + tage)
  return d.toISOString().slice(0, 10)
}
type Kundenart = 'zahlend' | 'eigen' | 'referenz' | 'passiv'
function artVon(wert: string | null | undefined): Kundenart {
  return wert === 'referenz' || wert === 'passiv' || wert === 'eigen' ? wert : 'zahlend'
}
const RANG: Record<Kundenart, number> = { zahlend: 0, eigen: 1, referenz: 2, passiv: 3 }
function rangVon(wert: string | null | undefined): number { return RANG[artVon(wert)] }

/** Eine Zeile aus pilot_kunden. Zahlen kommen aus Postgres teils als Text. */
export interface PilotKunde {
  client_id: string
  name: string
  logo_url: string | null
  client_type: string | null
  zustaendig_id: string | null
  pausiert_seit: string | null
  pause_grund?: string | null
  contract_end: string | null
  heute: string
  monat: string
  ziel: number
  ziel_naechster: number
  gepostet: number
  offen_monat: number
  gepostet_7t: number
  eingeplant: number
  fertig_ohne_termin: number
  im_ofen: number
  zettel: number
  raus: number
  belegt: number
  teig: number
  ideen: number
  links_fehlen: number
  zahlen_alt: number
  zuletzt_gepostet: string | null
  naechster_drehtag: string | null
  drehtag_videos: number
  vormonat_status: string | null
  vormonat_zahlstatus: string | null
  vormonat_quota: number | null
  /** Kontrollstempel (0069): bis wann ist alles geprueft? */
  geprueft_bis?: string | null
  monat_geprueft_bis?: string | null
  vormonat_geprueft_bis?: string | null
}

/** Ein Video, das zuletzt auffaellig gut lief (Index gegen den eigenen Median). */
export interface Erfolg {
  client_id: string
  video_id: string
  title: string
  faktor: number
}

export type EmpfehlungArt =
  | 'raus' | 'rueckstand' | 'einplanen' | 'drehtag' | 'drehtag_klein' | 'ideen' | 'ofen'
  | 'vertrag' | 'abrechnung' | 'erfolg' | 'links' | 'pause' | 'zahlen' | 'kontrolle'

export type PilotAmpel = 'rot' | 'gelb' | 'gruen' | 'blau'

export interface Empfehlung {
  key: string
  art: EmpfehlungArt
  clientId: string | null
  kunde: string | null
  logo: string | null
  /** Wem gehoert das (Ofen-Besitzer)? null = alle */
  besitzer: string | null
  /** Kurz, wie eine Schlagzeile: "3 fertige Videos ohne Posting-Tag" */
  titel: string
  /** Ein Satz, warum der Pilot das sagt. */
  warum: string
  /** Beschriftung des einen Knopfs. */
  aktion: string
  /** Wohin der Knopf fuehrt, wenn er nur navigiert. */
  ziel: string
  prio: number
  ampel: PilotAmpel
  /** Zahl, um die es geht (Videos, Tage ...). */
  zahl?: number
  /** Nur bei 'erfolg': das Video. */
  videoId?: string
  /** Nur bei 'kontrolle': welcher Monat soll abgeschlossen werden? */
  monatsKey?: string
}

/** Wo ein Kunde im Monat steht -- fuer Balken und Prognose. */
export interface KundenLage {
  kunde: PilotKunde
  /** So viele muessten nach Plan heute gepostet sein. */
  soll: number
  /** Noch zu posten bis Monatsende. */
  rest: number
  /** Alles mit Material: Teller + Raus + Ofen + Zettel + Belegt. */
  vorrat: number
  /** Bedarf der naechsten 30 Tage minus Vorrat (nie negativ). */
  fehlt: number
  /** Bedarf der naechsten 30 Tage (Rest dieses Monats + anteilig naechster). */
  bedarf: number
  /** Bei diesem Tempo am Monatsende: */
  prognose: number
  /** Wie viel vom Monat ist rum (0..1)? */
  monatAnteil: number
  ampel: PilotAmpel
  satz: string
  pausiert: boolean
  /** Bis wann ist dieser Monat kontrolliert (null = noch gar nicht)? */
  geprueftBis: string | null
  /** Stempel steht auf dem Monatsende: der Monat ist gruen. */
  gruen: boolean
}

export interface PilotEingang {
  kunden: PilotKunde[]
  erfolge?: Erfolg[]
  /** "YYYY-MM-DD" in deutscher Zeit (sonst aus den Zeilen). */
  heute?: string
}

export interface Pilot {
  lagen: KundenLage[]
  empfehlungen: Empfehlung[]
}

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0

export function tageImMonat(monat: string): number {
  const j = Number(monat.slice(0, 4)), m = Number(monat.slice(5, 7))
  return new Date(Date.UTC(j, m, 0)).getUTCDate()
}

export function tageZwischen(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000)
}

/** Letzter Tag eines Monats als ISO-Datum. */
export function monatsEnde(key: string): string {
  return `${key}-${String(tageImMonat(key)).padStart(2, '0')}`
}

export const kurzDatum = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`

function plural(z: number, eins: string, viele: string): string {
  return `${z} ${z === 1 ? eins : viele}`
}

/** Hat der Kunde ein Versprechen, das rot werden darf? */
function mitVertrag(k: PilotKunde): boolean {
  return artVon(k.client_type) === 'zahlend'
}

/** Monatslage eines Kunden. */
export function kundenLage(k: PilotKunde, heute = k.heute): KundenLage {
  const tag = Number(heute.slice(8, 10))
  const tage = tageImMonat(k.monat)
  const monatAnteil = Math.min(1, Math.max(0, tag / tage))
  const ziel = n(k.ziel)
  const gepostet = n(k.gepostet)
  const soll = Math.round(ziel * monatAnteil)
  const rest = Math.max(0, ziel - gepostet)
  const vorrat = n(k.eingeplant) + n(k.fertig_ohne_termin) + n(k.raus) + n(k.im_ofen) + n(k.zettel) + n(k.belegt)
  // Bedarf der naechsten 30 Tage: Rest dieses Monats plus der Teil des
  // naechsten Monats, der noch in die 30 Tage faellt.
  const restTage = tage - tag
  const naechsterAnteil = Math.min(1, Math.max(0, (30 - restTage) / 30))
  const bedarf = rest + Math.ceil(n(k.ziel_naechster) * naechsterAnteil)
  const fehlt = Math.max(0, bedarf - vorrat)
  const tempo = tag > 0 ? gepostet / tag * tage : 0
  // Prognose: Tempo, aber nie mehr als Material da ist (plus Ziel-Deckel)
  const prognose = ziel > 0 ? Math.min(ziel, Math.max(gepostet, Math.min(Math.round(tempo), gepostet + vorrat))) : gepostet
  const pausiert = !!k.pausiert_seit

  let ampel: PilotAmpel = 'gruen'
  let satz = ''
  if (pausiert) {
    ampel = 'gelb'
    satz = `Pausiert seit ${kurzDatum(k.pausiert_seit!)}`
  } else if (ziel === 0) {
    ampel = n(k.ziel_naechster) > 0 && fehlt > 0 ? 'gelb' : 'gruen'
    satz = n(k.ziel_naechster) > 0
      ? `Diesen Monat nichts bestellt · nächster Monat ${n(k.ziel_naechster)}`
      : gepostet > 0 ? `${gepostet} gepostet, kein Ziel` : 'Kein Ziel'
  } else if (gepostet >= ziel) {
    ampel = 'gruen'
    satz = `Ziel erreicht: ${gepostet} von ${ziel}`
  } else if (gepostet < soll - 1) {
    ampel = mitVertrag(k) ? 'rot' : 'gelb'
    satz = `${gepostet} von ${ziel} · nach Plan wären es ${soll}`
  } else if (fehlt > 0) {
    ampel = 'gelb'
    satz = `${gepostet} von ${ziel} · Vorrat reicht nicht (${fehlt} fehlen)`
  } else {
    satz = `${gepostet} von ${ziel} · im Plan`
  }
  const geprueftBis = k.monat_geprueft_bis ?? null
  const gruen = !!geprueftBis && geprueftBis >= monatsEnde(k.monat)
  if (gruen) satz = `${monatName(k.monat)} abgeschlossen ✓ · ${satz}`
  else if (geprueftBis) satz = `${satz} · geprüft bis ${kurzDatum(geprueftBis)}`
  return { kunde: k, soll, rest, vorrat, fehlt, bedarf, prognose, monatAnteil, ampel, satz, pausiert, geprueftBis, gruen }
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
export function monatName(key: string): string {
  return MONATE[Number(key.slice(5, 7)) - 1] ?? key
}

/** Alle Empfehlungen, wichtigste zuerst. */
export function pilot(e: PilotEingang): Pilot {
  const heute = e.heute ?? e.kunden[0]?.heute ?? ''
  const lagen = e.kunden.map((k) => kundenLage(k, heute || k.heute))
  const aus: Empfehlung[] = []

  for (const l of lagen) {
    const k = l.kunde
    const basis = {
      clientId: k.client_id, kunde: k.name, logo: k.logo_url, besitzer: k.zustaendig_id ?? null,
    }
    const rang = rangVon(k.client_type)
    // Zahlende Kunden ein Stueck wichtiger -- bei gleicher Lage.
    const bonus = rang === 0 ? 4 : rang === 1 ? 2 : 0

    if (l.pausiert) {
      const tage = tageZwischen(k.pausiert_seit!, heute || k.heute)
      if (tage >= 21) {
        aus.push({
          ...basis, key: `pause-${k.client_id}`, art: 'pause', prio: 35 + bonus, ampel: 'gelb', zahl: tage,
          titel: `Pausiert seit ${tage} Tagen`,
          warum: k.pause_grund ? `Grund: ${k.pause_grund}. Zeit, nachzufassen.` : 'Lange Pausen werden still zu Abschieden. Kurz nachfassen.',
          aktion: 'Kundenakte', ziel: `/client/${k.client_id}`,
        })
      }
    } else {
      // --- Rueckstand: hinter dem Plan ------------------------------------
      if (n(k.ziel) > 0 && n(k.gepostet) < l.soll - 1) {
        const diff = l.soll - n(k.gepostet)
        // Die eine Aktion: dort ansetzen, wo es klemmt.
        const [aktion, ziel] = n(k.fertig_ohne_termin) > 0
          ? ['Einplanen', `/client/${k.client_id}`]
          : n(k.belegt) > 0 && n(k.im_ofen) + n(k.zettel) === 0
            ? ['In den Ofen', '/ofen']
            : l.fehlt > 0 && !k.naechster_drehtag
              ? ['Drehtag planen', `/client/${k.client_id}`]
              : ['Kundenakte', `/client/${k.client_id}`]
        aus.push({
          ...basis, key: `rueck-${k.client_id}`, art: 'rueckstand', prio: 90 + bonus, ampel: mitVertrag(k) ? 'rot' : 'gelb', zahl: diff,
          titel: `${n(k.gepostet)} von ${n(k.ziel)} gepostet — nach Plan ${l.soll}`,
          warum: `${Math.round(l.monatAnteil * 100)} % vom ${monatName(k.monat)} sind rum. Bei diesem Tempo werden es ${l.prognose}.`,
          aktion, ziel,
        })
      }

      // --- Fertig, aber ohne Posting-Tag ----------------------------------
      if (n(k.fertig_ohne_termin) > 0) {
        aus.push({
          ...basis, key: `plan-${k.client_id}`, art: 'einplanen', prio: 85 + bonus, ampel: 'gelb', zahl: n(k.fertig_ohne_termin),
          titel: `${plural(n(k.fertig_ohne_termin), 'fertiges Video', 'fertige Videos')} ohne Posting-Tag`,
          warum: 'Liegt auf dem Teller, aber im Kalender steht nichts. Der Pilot verteilt sie auf die freien Tage.',
          aktion: 'Einplanen', ziel: `/client/${k.client_id}`,
        })
      }

      // --- Vorrat reicht nicht: Drehtag ------------------------------------
      if (l.fehlt > 0) {
        if (!k.naechster_drehtag) {
          aus.push({
            ...basis, key: `dreh-${k.client_id}`, art: 'drehtag', prio: 80 + bonus, ampel: mitVertrag(k) ? 'rot' : 'gelb', zahl: l.fehlt,
            titel: `${plural(l.fehlt, 'Video fehlt', 'Videos fehlen')} für die nächsten 30 Tage`,
            warum: `Bestellt ${l.bedarf}, mit Material ${l.vorrat}. Kein Drehtag geplant.`,
            aktion: 'Drehtag planen', ziel: `/client/${k.client_id}`,
          })
        } else if (n(k.drehtag_videos) < l.fehlt) {
          aus.push({
            ...basis, key: `drehklein-${k.client_id}`, art: 'drehtag_klein', prio: 60 + bonus, ampel: 'gelb', zahl: l.fehlt - n(k.drehtag_videos),
            titel: `Drehtag am ${kurzDatum(k.naechster_drehtag)} zu klein`,
            warum: `${n(k.drehtag_videos)} Videos geplant, ${l.fehlt} fehlen. Lieber mehr an einem Tag drehen als zweimal hinfahren.`,
            aktion: 'Drehtag öffnen', ziel: `/client/${k.client_id}`,
          })
        }
        // --- Ideen reichen nicht fuer den Dreh ---------------------------
        const ideenVorrat = n(k.ideen) + n(k.teig)
        if (ideenVorrat < l.fehlt) {
          aus.push({
            ...basis, key: `ideen-${k.client_id}`, art: 'ideen', prio: 70 + bonus, ampel: 'gelb', zahl: l.fehlt - ideenVorrat,
            titel: `${plural(l.fehlt - ideenVorrat, 'Idee fehlt', 'Ideen fehlen')} für den nächsten Dreh`,
            warum: `${l.fehlt} Videos zu drehen, ${ideenVorrat} Ideen da. Ohne Ideen kein Bestellzettel.`,
            aktion: 'Ideen holen', ziel: `/client/${k.client_id}?tab=pool`,
          })
        }
      }

      // --- Vertrag laeuft aus -------------------------------------------
      if (k.contract_end) {
        const tage = tageZwischen(heute || k.heute, k.contract_end)
        if (tage >= 0 && tage <= 30) {
          aus.push({
            ...basis, key: `vertrag-${k.client_id}`, art: 'vertrag', prio: 55 + bonus, ampel: 'gelb', zahl: tage,
            titel: `Vertrag endet in ${plural(tage, 'Tag', 'Tagen')}`,
            warum: `Läuft am ${kurzDatum(k.contract_end)} aus. Verlängerung jetzt ansprechen, nicht am letzten Tag.`,
            aktion: 'Kundenakte', ziel: `/client/${k.client_id}`,
          })
        }
      }
    }

    // --- Vormonat nicht abgerechnet --------------------------------------
    const vq = n(k.vormonat_quota)
    if (vq > 0 && Number(heute.slice(8, 10)) >= 3
      && (k.vormonat_status !== 'abgeschlossen' || (k.vormonat_zahlstatus ?? 'offen') === 'offen')) {
      const vormonat = monatName(datumPlus(k.monat + '-01', -1).slice(0, 7))
      const offenRechnung = (k.vormonat_zahlstatus ?? 'offen') === 'offen'
      aus.push({
        ...basis, key: `abr-${k.client_id}`, art: 'abrechnung', prio: 50 + bonus, ampel: 'gelb',
        titel: offenRechnung ? `${vormonat}: Rechnung noch nicht raus` : `${vormonat} noch nicht abgeschlossen`,
        warum: offenRechnung ? 'Der Monat ist vorbei, Geld kommt erst mit Rechnung.' : 'Abschließen, dann stimmt die Monatsübersicht.',
        aktion: offenRechnung ? 'Rechnung' : 'Abschließen', ziel: offenRechnung ? '/rechnungen' : '/monate',
      })
    }

    // --- Kontrolle: Monat abschliessen -----------------------------------
    // Vormonat mit Taetigkeit, noch nicht bis zum Monatsende gestempelt --
    // oder der laufende Monat an seinem letzten Tag.
    const vormonatKey = datumPlus(k.monat + '-01', -1).slice(0, 7)
    const vormonatAktiv = n(k.vormonat_quota) > 0 || !!k.vormonat_status
    if (vormonatAktiv && (k.vormonat_geprueft_bis ?? '') < monatsEnde(vormonatKey)) {
      aus.push({
        ...basis, key: `kontr-${k.client_id}-${vormonatKey}`, art: 'kontrolle', prio: 52 + bonus, ampel: 'gelb', monatsKey: vormonatKey,
        titel: `${monatName(vormonatKey)} noch nicht kontrolliert`,
        warum: k.vormonat_geprueft_bis ? `Geprüft bis ${kurzDatum(k.vormonat_geprueft_bis)}. Rest prüfen und abschließen.` : 'Alle Posts im CRM, Links da, Zahlen geholt? Dann abschließen — ab dann ist der Monat grün.',
        aktion: 'Abschließen', ziel: `/client/${k.client_id}`,
      })
    } else if ((heute || k.heute) === monatsEnde(k.monat) && n(k.ziel) > 0 && (k.monat_geprueft_bis ?? '') < monatsEnde(k.monat)) {
      aus.push({
        ...basis, key: `kontr-${k.client_id}-${k.monat}`, art: 'kontrolle', prio: 52 + bonus, ampel: 'gelb', monatsKey: k.monat,
        titel: `${monatName(k.monat)} abschließen`,
        warum: 'Letzter Tag des Monats. Einmal drüberschauen und den Stempel setzen.',
        aktion: 'Abschließen', ziel: `/client/${k.client_id}`,
      })
    }

    // --- Links fehlen ----------------------------------------------------
    if (n(k.links_fehlen) > 0) {
      aus.push({
        ...basis, key: `links-${k.client_id}`, art: 'links', prio: 40, ampel: 'blau', zahl: n(k.links_fehlen),
        titel: `${plural(n(k.links_fehlen), 'gepostetes Video', 'gepostete Videos')} ohne Links`,
        warum: 'Ohne TikTok- und Instagram-Link keine Zahlen und kein Archiv.',
        aktion: 'Nachtragen', ziel: `/client/${k.client_id}`,
      })
    }

    // --- Zahlen alt ------------------------------------------------------
    if (n(k.zahlen_alt) > 0) {
      aus.push({
        ...basis, key: `zahlen-${k.client_id}`, art: 'zahlen', prio: 30, ampel: 'blau', zahl: n(k.zahlen_alt),
        titel: `Zahlen von ${plural(n(k.zahlen_alt), 'Video', 'Videos')} älter als eine Woche`,
        warum: 'Frische Zahlen, sonst lernt die Analyse nichts.',
        aktion: 'Zahlen holen', ziel: `/analyse?kunde=${k.client_id}`,
      })
    }
  }

  // --- Je Ofen-Besitzer: Pizzen unter der Lampe, Ofen leer ---------------
  const proBesitzer = new Map<string, { backt: number; belegt: number; raus: number; kunden: string[] }>()
  for (const l of lagen) {
    const k = l.kunde
    const wer = k.zustaendig_id ?? ''
    const b = proBesitzer.get(wer) ?? { backt: 0, belegt: 0, raus: 0, kunden: [] }
    b.raus += n(k.raus)
    if (n(k.raus) > 0) b.kunden.push(k.name)
    if (!l.pausiert) { b.backt += n(k.im_ofen) + n(k.zettel); b.belegt += n(k.belegt) }
    proBesitzer.set(wer, b)
  }
  for (const [wer, b] of proBesitzer) {
    const besitzer = wer || null
    if (b.raus > 0) {
      aus.push({
        key: `raus-${wer}`, art: 'raus', clientId: null, kunde: null, logo: null, besitzer,
        prio: 95, ampel: 'gelb', zahl: b.raus,
        titel: `${plural(b.raus, 'Video wartet', 'Videos warten')} auf dein OK`,
        warum: `${b.kunden.join(', ')} — Vorschau fertig, liegt unter der Lampe. Servieren oder zurück in den Ofen.`,
        aktion: 'Anschauen', ziel: '/ofen',
      })
    }
    if (b.backt === 0 && b.belegt > 0 && besitzer) {
      aus.push({
        key: `ofen-${besitzer}`, art: 'ofen', clientId: null, kunde: null, logo: null, besitzer,
        prio: 75, ampel: 'gelb', zahl: b.belegt,
        titel: `Dein Ofen steht leer — ${plural(b.belegt, 'Video', 'Videos')} mit Material`,
        warum: 'Material ist da, aber kein Bestellzettel. Ein leerer Ofen ist verschenkte Zeit.',
        aktion: 'Anwerfen', ziel: '/ofen',
      })
    }
  }

  // --- Lernen: was gerade besonders gut laeuft ----------------------------
  for (const er of e.erfolge ?? []) {
    if (er.faktor < 1.8) continue
    const k = e.kunden.find((x) => x.client_id === er.client_id)
    aus.push({
      key: `erfolg-${er.video_id}`, art: 'erfolg', clientId: er.client_id, kunde: k?.name ?? null, logo: k?.logo_url ?? null,
      besitzer: k?.zustaendig_id ?? null, prio: 45, ampel: 'blau', zahl: er.faktor, videoId: er.video_id,
      titel: `„${er.title}“ läuft ${er.faktor.toFixed(1).replace('.', ',')}× besser als sonst`,
      warum: 'Was doppelt so gut läuft, verdient eine Fortsetzung. Der Pilot legt die Idee an.',
      aktion: 'Mehr davon', ziel: `/client/${er.client_id}?tab=pool`,
    })
  }

  // Sagt der Rueckstand schon "Einplanen" oder "Drehtag planen", ist die
  // eigene Zeile dafuer doppelt -- die Zahl wandert in den Rueckstand.
  const doppelt = new Set<string>()
  for (const r of aus) {
    if (r.art !== 'rueckstand' || !r.clientId) continue
    const zwilling = aus.find((x) => x.clientId === r.clientId && ((r.aktion === 'Einplanen' && x.art === 'einplanen') || (r.aktion === 'Drehtag planen' && x.art === 'drehtag')))
    if (zwilling) { doppelt.add(zwilling.key); r.zahl = zwilling.zahl; r.warum = `${r.warum} ${zwilling.warum}` }
  }
  const liste = aus.filter((x) => !doppelt.has(x.key))
  liste.sort((a, b) => b.prio - a.prio || (a.kunde ?? '').localeCompare(b.kunde ?? ''))
  lagen.sort((a, b) => AMPEL_RANG[a.ampel] - AMPEL_RANG[b.ampel] || rangVon(a.kunde.client_type) - rangVon(b.kunde.client_type) || a.kunde.name.localeCompare(b.kunde.name))
  return { lagen, empfehlungen: liste }
}

const AMPEL_RANG: Record<PilotAmpel, number> = { rot: 0, gelb: 1, blau: 2, gruen: 3 }

/** Nur, was mich angeht: meine Kunden, Unzugeordnetes, Allgemeines. */
export function meine(liste: Empfehlung[], memberId: string | null): Empfehlung[] {
  if (!memberId) return liste
  return liste.filter((x) => !x.besitzer || x.besitzer === memberId)
}

/** Ein Satz fuer die Begruessung: "3 Vorschläge — Hajo braucht einen Drehtag". */
export function pilotSatz(liste: Empfehlung[]): string {
  if (liste.length === 0) return 'Nichts offen. Der Pilot hat keine Einwände.'
  const erste = liste[0]
  const n = liste.length
  return `${n === 1 ? '1 Vorschlag' : `${n} Vorschläge`} — ${erste.titel}`
}

/** Fuer den Push: die wichtigsten drei, kurz. */
export function pushZeilen(liste: Empfehlung[], max = 3): string[] {
  return liste.slice(0, max).map((x) => (x.kunde && !x.titel.startsWith(x.kunde) ? `${x.kunde}: ${x.titel}` : x.titel))
}
