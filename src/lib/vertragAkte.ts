import { supabase } from './supabase'
import { contractPdf, contractFilename, type SignInfo } from './contractPdf'
import type { ContractBody } from './contract'

export const VERTRAG_BUCKET = 'vertraege'

export interface VertragAkteRow {
  id: string
  client_id: string
  body: ContractBody
  status: string
  signed_at: string | null
  signer_name: string | null
  signer_role: string | null
  pdf_path: string | null
}

// Ablageort im Storage. Ein Pfad je Vertrag — beim erneuten Hochladen wird
// dieselbe Datei ueberschrieben, es entsteht kein Wildwuchs.
export function archivPfad(clientId: string, contractId: string): string {
  return `${clientId}/${contractId}.pdf`
}

// Telefonnummer in das Format, das wa.me erwartet: nur Ziffern, mit
// Laendervorwahl, ohne fuehrende Null. "0151 234" -> "49151234".
export function waNummer(phone: string | null | undefined): string | null {
  if (!phone) return null
  let s = phone.replace(/[^\d+]/g, '')
  if (s.startsWith('+')) s = s.slice(1)
  else if (s.startsWith('00')) s = s.slice(2)
  else if (s.startsWith('0')) s = '49' + s.slice(1)
  return s.length >= 8 ? s : null
}

// WhatsApp-Link. Mit Nummer landet man direkt im Chat, ohne Nummer in der
// Kontaktauswahl. Der Text enthaelt den Link zum Vertrag.
export function whatsappLink(text: string, phone?: string | null): string {
  const nr = waNummer(phone)
  return `https://wa.me/${nr ?? ''}?text=${encodeURIComponent(text)}`
}

// Nachricht fuer WhatsApp bzw. als Mailtext. Bewusst kurz — der Vertrag
// haengt als PDF dran oder steht hinter dem Link.
export function nachricht(kunde: string, link: string): string {
  return (
    `Hallo, hier ist der unterschriebene Vertrag zwischen Sow & Loynab Media und ${kunde}. ` +
    `Du kannst ihn hier jederzeit ansehen und als PDF herunterladen: ${link}`
  )
}

export function mailVorlage(kunde: string, link: string): { subject: string; html: string } {
  return {
    subject: `Vertrag ${kunde} — unterschriebene Fassung`,
    html:
      `<p>Hallo,</p>` +
      `<p>im Anhang findest du den unterschriebenen Vertrag zwischen Sow &amp; Loynab Media und ${kunde} als PDF.</p>` +
      `<p>Du kannst ihn jederzeit auch <a href="${link}">online ansehen und herunterladen</a>.</p>` +
      `<p>Viele Grüße<br>Sow &amp; Loynab Media</p>`,
  }
}

// Das PDF aus dem gespeicherten Vertragstext erzeugen. Weil der Text im
// Vertrag eingefroren ist, kommt dabei immer dieselbe Datei heraus.
export function vertragPdf(row: VertragAkteRow, clientName: string): { blob: Blob; name: string } {
  const sign: SignInfo = {
    signed_at: row.signed_at,
    signer_name: row.signer_name,
    signer_role: row.signer_role,
    client_name: clientName,
  }
  const doc = contractPdf(row.body, sign)
  return { blob: doc.output('blob'), name: contractFilename(row.body, row.status === 'signed') }
}

// Legt das PDF im Storage ab und merkt sich den Pfad am Vertrag. Laeuft
// automatisch, sobald ein unterschriebener Vertrag geoeffnet wird — damit die
// Kopie auch dann noch da ist, wenn der Rechner mal nicht zur Hand ist.
export async function archiviere(row: VertragAkteRow, clientName: string): Promise<string> {
  const pfad = archivPfad(row.client_id, row.id)
  const { blob } = vertragPdf(row, clientName)
  const { error } = await supabase.storage.from(VERTRAG_BUCKET).upload(pfad, blob, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw error
  const { error: e2 } = await supabase.from('contracts').update({ pdf_path: pfad }).eq('id', row.id)
  if (e2) throw e2
  return pfad
}

// Teilen ueber das System-Teilen-Menue (iPhone: WhatsApp, Mail, Dateien …).
// Kann das Geraet keine Dateien teilen, geben wir das zurueck — dann nimmt die
// Oberflaeche den WhatsApp-Link mit Vertragslink.
export async function teile(blob: Blob, name: string, text: string): Promise<boolean> {
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
  if (typeof nav.share !== 'function') return false
  const file = new File([blob], name, { type: 'application/pdf' })
  if (nav.canShare && !nav.canShare({ files: [file] })) return false
  try {
    await nav.share({ files: [file], title: name, text } as ShareData)
    return true
  } catch (e) {
    // Abbruch durch den Nutzer ist kein Fehler
    if ((e as Error).name === 'AbortError') return true
    return false
  }
}
