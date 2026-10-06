// Der Assistent: ein Auftrag, mehrere Schritte.
// ---------------------------------------------------------------------------
// "Leg Pizzeria Bella an, 1.200 im Monat, 12 Videos ab Oktober, immer am 1.,
// 3., 5. -- aber am 17. nicht, und trag mir Freitag 16 Uhr Arbeitszeit ein."
//
// Das ist ein Auftrag, aber fuenf Schritte. Deshalb liefert der Assistent
// keine einzelne Absicht mehr, sondern eine LISTE von Schritten, die wir
// nacheinander ausfuehren.
//
// Zwei Entscheidungen, die alles andere traegt:
//
// 1. GESCHRIEBEN WIRD HIER, nicht auf dem Server. Die Edge Function plant
//    nur. Damit laeuft jede Aenderung ueber den angemeldeten Nutzer und die
//    normalen Schutzregeln der Datenbank -- es gibt nirgends einen
//    Generalschluessel, der alles duerfte.
//
// 2. ERST ZEIGEN, DANN TUN. Der Plan wird angezeigt, bevor etwas passiert.
//    Bei zwoelf Videokarten will man vorher sehen, ob der Rhythmus stimmt.
//
// Schritte koennen aufeinander aufbauen: "neuen Kunden anlegen" und danach
// "fuer diesen Kunden planen". Dafuer vergibt der Plan Platzhalter (ref),
// die beim Ausfuehren durch die echten Ids ersetzt werden.

import { supabase } from './supabase'
import { insertRows, updateRow } from './db'
import { gleichmaessigeTermine, platzhalterNamen, vorschlagAbstand } from './monatsrhythmus'
import { hoechsteNummer } from './autoplan'
import { setzeMonatsmenge } from './monatsmenge'

export type SchrittArt =
  | 'kunde_anlegen'
  | 'kunde_aendern'
  | 'monatsplan'
  | 'video_anlegen'
  | 'video_absagen'
  | 'aufgabe_anlegen'
  | 'termin_anlegen'
  | 'lead_anlegen'
  | 'lead_aendern'
  | 'idee_anlegen'
  | 'profilbild_holen'

/** Verweis auf einen Kunden: entweder eine echte Id oder ein Platzhalter. */
export interface KundenBezug {
  client_id?: string | null
  /** Platzhalter aus einem frueheren Schritt desselben Plans, z. B. "k1". */
  client_ref?: string | null
}

export type Schritt =
  | ({ art: 'kunde_anlegen'; ref: string; name: string; honorar?: number | null
      videos_pro_monat?: number | null; marke?: string | null; kundenart?: string | null
      instagram?: string | null; tiktok?: string | null; stadt?: string | null })
  | ({ art: 'kunde_aendern'; felder: Record<string, unknown> } & KundenBezug)
  | ({ art: 'monatsplan'; monat: string; anzahl: number; abstand?: number | null
      start_tag?: number | null; auslassen?: number[] | null; uhrzeit?: string | null } & KundenBezug)
  | ({ art: 'video_anlegen'; titel: string; datum: string; uhrzeit?: string | null } & KundenBezug)
  | ({ art: 'video_absagen'; datum: string } & KundenBezug)
  | ({ art: 'aufgabe_anlegen'; titel: string; datum?: string | null; uhrzeit?: string | null
      wer?: string[] | null } & KundenBezug)
  | ({ art: 'termin_anlegen'; titel: string; kind: string; von: string; bis?: string | null
      ab?: string | null; bis_zeit?: string | null; wer?: string[] | null })
  | ({ art: 'lead_anlegen'; ref?: string | null; name: string; stand?: string | null
      ansprechpartner?: string | null; telefon?: string | null; email?: string | null
      instagram?: string | null; stadt?: string | null; potenzial?: number | null
      naechster_schritt?: string | null; notiz?: string | null })
  | ({ art: 'lead_aendern'; lead_id?: string | null; lead_ref?: string | null
      stand?: string | null; felder?: Record<string, unknown> | null })
  | ({ art: 'idee_anlegen'; titel: string; notiz?: string | null } & KundenBezug)
  | ({ art: 'profilbild_holen'; plattform: string; handle: string } & KundenBezug)

export interface SchrittErgebnis {
  schritt: Schritt
  ok: boolean
  text: string
}

/** Ein Satz, der beschreibt, was der Schritt tun wird. Fuer die Vorschau. */
export function beschreibe(s: Schritt, kundenName: (b: KundenBezug & { ref?: string }) => string): string {
  switch (s.art) {
    case 'kunde_anlegen': {
      const teile = [`Kunde „${s.name}" anlegen`]
      if (s.honorar != null) teile.push(`${s.honorar} € im Monat`)
      if (s.videos_pro_monat != null) teile.push(`${s.videos_pro_monat} Videos/Monat`)
      return teile.join(' · ')
    }
    case 'kunde_aendern':
      return `${kundenName(s)} ändern: ${Object.keys(s.felder).join(', ')}`
    case 'monatsplan':
      return `${s.anzahl} Videos für ${kundenName(s)} im Monat ${s.monat}`
        + (s.abstand ? `, alle ${s.abstand} Tage` : '')
        + (s.start_tag && s.start_tag > 1 ? `, ab dem ${s.start_tag}.` : '')
        + (s.auslassen?.length ? ` (ohne den ${s.auslassen.join('., ')}.)` : '')
    case 'video_anlegen':
      return `Video „${s.titel}" für ${kundenName(s)} am ${datumKurz(s.datum)}`
    case 'video_absagen':
      return `Video von ${kundenName(s)} am ${datumKurz(s.datum)} absagen`
    case 'aufgabe_anlegen':
      return `Aufgabe „${s.titel}"` + (s.datum ? ` am ${datumKurz(s.datum)}` : '')
    case 'termin_anlegen':
      return `Termin „${s.titel}" am ${datumKurz(s.von)}`
        + (s.bis && s.bis !== s.von ? ` bis ${datumKurz(s.bis)}` : '')
        + (s.ab ? `, ${s.ab}${s.bis_zeit ? `–${s.bis_zeit}` : ''} Uhr` : ', ganztägig')
    case 'lead_anlegen': {
      const teile = [`Lead „${s.name}" anlegen`]
      if (s.stand) teile.push(STAND_NAME[s.stand] ?? s.stand)
      if (s.stadt) teile.push(s.stadt)
      if (s.potenzial != null) teile.push(`${s.potenzial} €/Monat möglich`)
      return teile.join(' · ')
    }
    case 'lead_aendern':
      return `Lead ändern${s.stand ? `: Stand auf „${STAND_NAME[s.stand] ?? s.stand}"` : ''}`
    case 'idee_anlegen':
      return `Idee „${s.titel}" in den Speicher von ${kundenName(s)}`
    case 'profilbild_holen':
      return `Profilbild von ${s.plattform === 'tiktok' ? 'TikTok' : 'Instagram'} @${s.handle.replace(/^@/, '')} für ${kundenName(s)} holen`
    default:
      return 'Unbekannter Schritt'
  }
}

const STAND_NAME: Record<string, string> = {
  new: 'Neu', contacted: 'Kontaktiert', talking: 'Im Gespräch',
  offer: 'Angebot', won: 'Gewonnen', lost: 'Verloren',
}

function datumKurz(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  return `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.`
}

/**
 * Plan auf Plausibilitaet pruefen, bevor irgendetwas passiert.
 *
 * Gibt Klartext-Beanstandungen zurueck. Eine leere Liste heisst: kann
 * ausgefuehrt werden.
 */
export function pruefe(schritte: Schritt[]): string[] {
  const fehler: string[] = []
  const refs = new Set<string>()

  schritte.forEach((s, i) => {
    const nr = i + 1
    if (s.art === 'kunde_anlegen') {
      if (!s.name?.trim()) fehler.push(`Schritt ${nr}: Der Kunde hat keinen Namen.`)
      if (s.ref) refs.add(s.ref)
      return
    }
    if (s.art === 'lead_anlegen') {
      if (!s.name?.trim()) fehler.push(`Schritt ${nr}: Der Lead hat keinen Namen.`)
      if (s.stand && !STAENDE.has(s.stand)) fehler.push(`Schritt ${nr}: „${s.stand}" ist kein bekannter Stand.`)
      if (s.ref) refs.add(s.ref)
      return
    }
    if (s.art === 'lead_aendern') {
      if (!s.lead_id && !s.lead_ref) fehler.push(`Schritt ${nr}: Kein Lead angegeben.`)
      else if (s.lead_ref && !refs.has(s.lead_ref)) fehler.push(`Schritt ${nr}: Verweist auf einen Lead, der vorher nicht angelegt wird.`)
      if (s.stand && !STAENDE.has(s.stand)) fehler.push(`Schritt ${nr}: „${s.stand}" ist kein bekannter Stand.`)
      return
    }
    if (s.art === 'profilbild_holen') {
      if (!s.handle?.trim()) fehler.push(`Schritt ${nr}: Kein Handle angegeben.`)
      if (!['instagram', 'tiktok'].includes(s.plattform)) fehler.push(`Schritt ${nr}: „${s.plattform}" kenne ich nicht.`)
    }
    if (s.art === 'termin_anlegen') {
      if (!s.titel?.trim()) fehler.push(`Schritt ${nr}: Der Termin hat keinen Titel.`)
      if (!istDatum(s.von)) fehler.push(`Schritt ${nr}: „${s.von}" ist kein Datum.`)
      return
    }
    // Alles Uebrige haengt an einem Kunden.
    const b = s as KundenBezug
    if (!b.client_id && !b.client_ref) {
      if (s.art !== 'aufgabe_anlegen') fehler.push(`Schritt ${nr}: Kein Kunde angegeben.`)
    } else if (b.client_ref && !refs.has(b.client_ref)) {
      fehler.push(`Schritt ${nr}: Verweist auf einen Kunden, der vorher nicht angelegt wird.`)
    }
    if (s.art === 'monatsplan') {
      if (!/^\d{4}-\d{2}$/.test(s.monat)) fehler.push(`Schritt ${nr}: „${s.monat}" ist kein Monat.`)
      if (!(s.anzahl > 0)) fehler.push(`Schritt ${nr}: Keine Videomenge angegeben.`)
      if (s.anzahl > 60) fehler.push(`Schritt ${nr}: ${s.anzahl} Videos in einem Monat — das ist zu viel.`)
    }
    if ((s.art === 'video_anlegen' || s.art === 'video_absagen') && !istDatum(s.datum)) {
      fehler.push(`Schritt ${nr}: „${s.datum}" ist kein Datum.`)
    }
  })

  return fehler
}

const STAENDE = new Set(['new', 'contacted', 'talking', 'offer', 'won', 'lost'])

function istDatum(d: unknown): boolean {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
}

/**
 * Den Plan ausfuehren. Schritt fuer Schritt, in der Reihenfolge des Plans.
 *
 * Bricht beim ersten Fehler ab: ein halb ausgefuehrter Plan ist leichter zu
 * reparieren als einer, der nach einem Fehler munter weitergelaufen ist und
 * Karten an den falschen Kunden gehaengt hat.
 */
export async function fuehreAus(
  schritte: Schritt[],
  userId: string | null,
): Promise<SchrittErgebnis[]> {
  const out: SchrittErgebnis[] = []
  // Platzhalter -> echte Id, waehrend der Plan laeuft
  const refs = new Map<string, string>()

  const idVon = (b: KundenBezug): string | null =>
    b.client_id ?? (b.client_ref ? refs.get(b.client_ref) ?? null : null)

  for (const s of schritte) {
    try {
      const text = await einSchritt(s, idVon, refs, userId)
      out.push({ schritt: s, ok: true, text })
    } catch (err: any) {
      out.push({ schritt: s, ok: false, text: err?.message ?? 'Fehlgeschlagen' })
      break
    }
  }
  return out
}

async function einSchritt(
  s: Schritt,
  idVon: (b: KundenBezug) => string | null,
  refs: Map<string, string>,
  userId: string | null,
): Promise<string> {
  switch (s.art) {
    case 'kunde_anlegen': {
      const payload: Record<string, unknown> = {
        name: s.name.trim(),
        monthly_fee: s.honorar ?? null,
        monthly_quota: s.videos_pro_monat ?? null,
        brand: s.marke ?? 'media',
        client_type: s.kundenart ?? 'zahlend',
        active: (s.kundenart ?? 'zahlend') !== 'passiv',
        handle_ig: s.instagram?.replace(/^@/, '') || null,
        handle_tiktok: s.tiktok?.replace(/^@/, '') || null,
        city: s.stadt || null,
        created_by: userId,
      }
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
      if (error) throw new Error(error.message)
      const id = (data as any).id as string
      if (s.ref) refs.set(s.ref, id)
      // Handles zusaetzlich als Social-Accounts, sonst holt der Nachtlauf
      // fuer den frischen Kunden keine Zahlen.
      const accs = [
        s.instagram && { client_id: id, platform: 'instagram', handle: s.instagram.replace(/^@/, '').toLowerCase(), sort: 0 },
        s.tiktok && { client_id: id, platform: 'tiktok', handle: s.tiktok.replace(/^@/, '').toLowerCase(), sort: 0 },
      ].filter(Boolean)
      if (accs.length) await supabase.from('client_accounts').insert(accs as any[])
      return `Kunde „${s.name}" angelegt`
    }

    case 'kunde_aendern': {
      const id = idVon(s)
      if (!id) throw new Error('Kunde nicht gefunden')
      const { error } = await updateRow('clients', s.felder, 'id', id)
      if (error) throw new Error(error.message)
      return 'Kunde geändert'
    }

    case 'monatsplan': {
      const id = idVon(s)
      if (!id) throw new Error('Kunde nicht gefunden')

      const { data: da } = await supabase
        .from('videos').select('title, scheduled_date')
        .eq('client_id', id).is('deleted_at', null)
      const vorhanden = (da ?? []) as { title: string; scheduled_date: string | null }[]
      const belegt = new Set(vorhanden.map((v) => v.scheduled_date ?? '').filter(Boolean))

      const startTag = s.start_tag ?? 1
      const abstand = s.abstand ?? vorschlagAbstand(s.monat, s.anzahl, startTag)
      const aus = new Set(s.auslassen ?? [])
      const termine = gleichmaessigeTermine({ monatsKey: s.monat, anzahl: s.anzahl, startTag, abstand })
        .filter((t) => !aus.has(Number(t.slice(8, 10))))
        .filter((t) => !belegt.has(t))

      if (termine.length === 0) return 'Nichts anzulegen — die Tage waren schon belegt'

      const namen = platzhalterNamen(s.monat, termine.length, hoechsteNummer(vorhanden.map((v) => v.title), s.monat))
      const { error } = await insertRows('videos', termine.map((d, i) => ({
        client_id: id, title: namen[i], status: 'todo',
        scheduled_date: d, scheduled_time: s.uhrzeit || null, created_by: userId,
      })))
      if (error) throw new Error(error.message)

      await setzeMonatsmenge(id, s.monat, s.anzahl, null)
      return `${termine.length} Videos angelegt (${termine.map((t) => Number(t.slice(8, 10)) + '.').join(' ')})`
    }

    case 'video_anlegen': {
      const id = idVon(s)
      if (!id) throw new Error('Kunde nicht gefunden')
      const { error } = await insertRows('videos', [{
        client_id: id, title: s.titel.trim() || 'Neues Video', status: 'todo',
        scheduled_date: s.datum, scheduled_time: s.uhrzeit || null, created_by: userId,
      }])
      if (error) throw new Error(error.message)
      return `Video „${s.titel}" angelegt`
    }

    case 'video_absagen': {
      const id = idVon(s)
      if (!id) throw new Error('Kunde nicht gefunden')
      // In den Papierkorb, nicht endgueltig: ein falsch verstandener Satz
      // soll keine Arbeit vernichten.
      const { data, error } = await supabase.from('videos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('client_id', id).eq('scheduled_date', s.datum).is('deleted_at', null)
        .select('id')
      if (error) throw new Error(error.message)
      const n = (data ?? []).length
      return n === 0 ? `Am ${datumKurz(s.datum)} lag nichts an` : `${n} Video(s) vom ${datumKurz(s.datum)} in den Papierkorb`
    }

    case 'lead_anlegen': {
      const payload: Record<string, unknown> = {
        name: s.name.trim(),
        stage: s.stand && STAENDE.has(s.stand) ? s.stand : 'new',
        contact_person: s.ansprechpartner || null,
        phone: s.telefon || null,
        email: s.email || null,
        handle_ig: s.instagram?.replace(/^@/, '') || null,
        city: s.stadt || null,
        potential_fee: s.potenzial ?? null,
        next_followup: s.naechster_schritt || null,
        notes: s.notiz || null,
        created_by: userId,
      }
      const { data, error } = await supabase.from('leads').insert(payload).select('id').single()
      if (error) throw new Error(error.message)
      if (s.ref) refs.set(s.ref, (data as any).id as string)
      return `Lead „${s.name}" angelegt`
    }

    case 'lead_aendern': {
      const id = s.lead_id ?? (s.lead_ref ? refs.get(s.lead_ref) ?? null : null)
      if (!id) throw new Error('Lead nicht gefunden')
      const felder = { ...(s.felder ?? {}) }
      if (s.stand && STAENDE.has(s.stand)) (felder as any).stage = s.stand
      if (Object.keys(felder).length === 0) return 'Nichts zu ändern'
      const { error } = await updateRow('leads', felder, 'id', id)
      if (error) throw new Error(error.message)
      return 'Lead geändert'
    }

    case 'idee_anlegen': {
      const id = idVon(s)
      if (!id) throw new Error('Kunde nicht gefunden')
      const { error } = await supabase.from('video_ideas').insert({
        client_id: id, title: s.titel.trim(), notes: s.notiz || null,
        source: 'manual', created_by: userId,
      })
      if (error) throw new Error(error.message)
      return `Idee „${s.titel}" gespeichert`
    }

    case 'profilbild_holen': {
      const id = idVon(s)
      if (!id) throw new Error('Kunde nicht gefunden')
      const handle = s.handle.replace(/^@/, '').trim()
      const { data, error } = await supabase.functions.invoke('apify-profile', {
        body: { platform: s.plattform, handle, client_id: id },
      })
      if (error) throw new Error(error.message)
      const a = data as any
      if (a?.error) throw new Error(a.error)
      if (!a?.logo_url) throw new Error(`Für @${handle} kam kein Profilbild zurück`)
      return `Profilbild von @${handle} übernommen`
    }

    case 'aufgabe_anlegen': {
      const { error } = await insertRows('tasks', [{
        title: s.titel.trim(), done: false,
        due_date: s.datum || null, due_time: s.uhrzeit || null,
        client_id: idVon(s), assignee_ids: s.wer ?? [], created_by: userId,
      }])
      if (error) throw new Error(error.message)
      return `Aufgabe „${s.titel}" angelegt`
    }

    case 'termin_anlegen': {
      const { error } = await supabase.from('events').insert({
        title: s.titel.trim(),
        kind: s.kind || 'termin',
        starts_on: s.von,
        ends_on: s.bis && s.bis !== s.von ? s.bis : null,
        starts_at: s.ab || null,
        ends_at: s.bis_zeit || null,
        member_ids: s.wer ?? [],
        created_by: userId,
      })
      if (error) {
        throw new Error(/does not exist|schema cache/i.test(error.message)
          ? 'Dafür fehlt noch das Skript 0032 in der Datenbank.'
          : error.message)
      }
      return `Termin „${s.titel}" eingetragen`
    }

    default:
      throw new Error('Unbekannter Schritt')
  }
}
