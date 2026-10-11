import type { Company } from './settings'

// Der Rahmenvertrag als Datenstruktur. Aus derselben Quelle entstehen die
// Ansicht im Dashboard, die Seite zum Unterschreiben und das PDF — so kann
// nirgends eine abweichende Fassung entstehen.
export interface ContractParty {
  name: string
  vertreten?: string | null
  adresse?: string | null
}

// Wohin die Rechnung geht. Oft identisch mit dem Kunden, manchmal aber eine
// andere Firma oder ein Steuerbüro — deshalb eigene Felder.
export interface Rechnungsempfaenger {
  name?: string | null
  adresse?: string | null
  email?: string | null
}

// Die kaufmaennischen Eckdaten. Stehen im Vertragstext selbst (§ 2) — das ist
// genau der Teil, der sonst "gesondert vereinbart" war und deshalb nie
// irgendwo schriftlich stand.
export interface Konditionen {
  videos: number | null      // Videos je Kalendermonat
  netto: number | null       // € netto je Monat
  ust: number | null         // Prozent; 0 = Kleinunternehmer nach § 19 UStG
  brutto: number | null      // ausgerechnet und mitgespeichert
  rechnung: Rechnungsempfaenger
}

export interface ContractBody {
  version: number
  titel: string
  agentur: ContractParty
  kunde: ContractParty
  konditionen: Konditionen
  // Kaufmännische Eckdaten, die im Text auftauchen
  stundensatz: number | null      // € netto für Zusatzaufwand
  kuendigungsfrist: string        // z. B. "einem Monat zum Monatsende"
  gerichtsstand: string
  reisekostenOrt: string
  korrekturschleifen: number
  beginn: string | null           // ISO-Datum
  paragraphen: { titel: string; absaetze: string[] }[]
}

export interface ContractVars {
  agentur: ContractParty
  kunde: ContractParty
  konditionen: Omit<Konditionen, 'brutto'>
  stundensatz: number | null
  kuendigungsfrist: string
  gerichtsstand: string
  reisekostenOrt: string
  korrekturschleifen: number
  beginn: string | null
}

export const FRIST_MONATLICH = 'einem Monat zum Ende eines Kalendermonats'

const zahlwort = (n: number) => ['null', 'eine', 'zwei', 'drei', 'vier', 'fünf'][n] ?? String(n)
const satz = (n: number | null) => (n == null ? '[Stundensatz]' : `${n.toLocaleString('de-DE')} €`)
const dat = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '[Datum]'

// Betraege im Vertragstext immer mit zwei Stellen — "1.190,00 €", nicht "1190 €".
export function betrag(n: number | null): string {
  if (n == null) return '[Betrag]'
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

// Brutto aus Netto und Steuersatz. Auf Cent gerundet, damit im Vertrag und
// spaeter auf der Rechnung derselbe Betrag steht.
export function bruttoVon(netto: number | null, ust: number | null): number | null {
  if (netto == null || ust == null) return null
  return Math.round(netto * (1 + ust / 100) * 100) / 100
}

// Was noch fehlt, bevor der Vertrag rausgehen darf. Ein Entwurf darf Luecken
// haben — versendet wird aber nur, was vollstaendig ist.
export function fehlendeAngaben(v: ContractVars): string[] {
  const offen: string[] = []
  if (!v.kunde.name?.trim()) offen.push('Name des Kunden')
  if (!v.kunde.vertreten?.trim()) offen.push('Ansprechpartner beim Kunden')
  if (!v.agentur.vertreten?.trim()) offen.push('Vertreter der Agentur')
  if (v.konditionen.videos == null) offen.push('Videoanzahl')
  if (v.konditionen.netto == null) offen.push('Nettobetrag')
  if (v.konditionen.ust == null) offen.push('Umsatzsteuer')
  // Fehlt keine eigene Rechnungsanschrift, geht die Rechnung an die Kundenanschrift —
  // so wie es auch im Vertragstext steht.
  if (!v.konditionen.rechnung.adresse?.trim() && !v.kunde.adresse?.trim()) offen.push('Rechnungsanschrift')
  if (!v.beginn) offen.push('Beginn')
  return offen
}

export function vertragKomplett(v: ContractVars): boolean {
  return fehlendeAngaben(v).length === 0
}

// Rechnungsempfaenger als eine Zeile — faellt auf den Kunden zurueck, wenn
// kein abweichender Empfaenger eingetragen ist.
export function rechnungZeile(b: ContractBody): string {
  const r = b.konditionen.rechnung
  const name = r.name?.trim() || b.kunde.name
  const teile = [name, r.adresse?.trim() || b.kunde.adresse || '[Rechnungsanschrift]']
  return teile.filter(Boolean).join(', ')
}

// Baut den vollständigen Vertragstext. Wird beim Versenden einmal erzeugt und
// dann als Kopie gespeichert — spätere Änderungen an dieser Vorlage berühren
// bereits unterschriebene Verträge nicht.
export function buildContract(v: ContractVars): ContractBody {
  const n = v.korrekturschleifen
  const mehrzahl = n === 1 ? 'ist eine Korrekturschleife' : `sind ${zahlwort(n)} Korrekturschleifen`
  const zweite = n > 1
    ? ' Die jeweils folgende Schleife darf nur Punkte betreffen, die bereits in der ersten Rückmeldung genannt wurden.'
    : ''

  const k = v.konditionen
  const brutto = bruttoVon(k.netto, k.ust)
  const anzahl = k.videos == null ? '[Anzahl]' : String(k.videos)
  const videoWort = k.videos === 1 ? 'Video' : 'Videos'

  // Kleinunternehmer (0 %) braucht einen anderen Satz als der Regelfall —
  // sonst steht im Vertrag eine Umsatzsteuer, die gar nicht berechnet wird.
  const verguetung = k.ust === 0
    ? `Die Vergütung beträgt ${betrag(k.netto)} je Kalendermonat. Die Agentur ist Kleinunternehmerin im Sinne des § 19 UStG, Umsatzsteuer wird nicht berechnet. Der monatlich zu zahlende Betrag beträgt damit ${betrag(k.netto)}.`
    : `Die Vergütung beträgt ${betrag(k.netto)} netto je Kalendermonat. Hinzu kommt die gesetzliche Umsatzsteuer von ${k.ust == null ? '[Satz]' : `${k.ust.toLocaleString('de-DE')} %`}. Der monatlich zu zahlende Gesamtbetrag beträgt damit ${betrag(brutto)} brutto.`

  const empfaenger = k.rechnung.name?.trim() || v.kunde.name
  const anschrift = k.rechnung.adresse?.trim() || v.kunde.adresse?.trim() || '[Rechnungsanschrift]'
  const rechnungsSatz =
    `Rechnungen gehen an: ${empfaenger}, ${anschrift}` +
    (k.rechnung.email?.trim() ? `, ${k.rechnung.email.trim()}` : '') +
    '. Änderungen der Rechnungsanschrift teilt der Kunde unverzüglich in Textform mit.'

  return {
    version: 2,
    titel: 'Rahmenvertrag über Social-Media-Videoproduktion',
    agentur: v.agentur,
    kunde: v.kunde,
    konditionen: { ...k, brutto },
    stundensatz: v.stundensatz,
    kuendigungsfrist: v.kuendigungsfrist,
    gerichtsstand: v.gerichtsstand,
    reisekostenOrt: v.reisekostenOrt,
    korrekturschleifen: n,
    beginn: v.beginn,
    paragraphen: [
      { titel: '§ 1 Gegenstand des Vertrags', absaetze: [
        'Die Agentur erbringt für den Kunden Leistungen der Konzeption, Produktion und Veröffentlichung von Kurzvideos für soziale Netzwerke, insbesondere Instagram und TikTok.',
        'Anzahl der Videos, Vergütung und Zahlungsweise sind in § 2 geregelt. Alles Weitere regeln die folgenden Paragraphen; Abweichungen davon gelten nur, wenn beide Seiten sie in Textform vereinbaren.',
        'Die Agentur schuldet die vereinbarte Produktion und Veröffentlichung, nicht einen bestimmten wirtschaftlichen Erfolg. Reichweiten, Aufrufzahlen und Neukunden hängen von Faktoren ab, die außerhalb des Einflussbereichs der Agentur liegen, insbesondere von den Algorithmen der Plattformen.',
      ] },
      { titel: '§ 2 Umfang und Vergütung', absaetze: [
        `Die Agentur produziert für den Kunden ${anzahl} ${videoWort} je Kalendermonat und veröffentlicht sie nach Freigabe.`,
        verguetung,
        'Die Abrechnung erfolgt monatlich im Voraus. Rechnungen sind innerhalb von 14 Tagen ab Rechnungsdatum ohne Abzug zur Zahlung fällig.',
        rechnungsSatz,
      ] },
      { titel: '§ 3 Leistungsumfang', absaetze: [
        'Soweit nichts anderes vereinbart ist, umfasst ein Video: Konzeption, Dreh, Schnitt, Vertonung, Untertitel sowie die Erstellung einer Bildunterschrift.',
        'Drehtermine finden nach vorheriger Abstimmung in den Räumlichkeiten des Kunden statt.',
        'Die Veröffentlichung erfolgt über die Kanäle des Kunden. Ist die Agentur mit der Veröffentlichung beauftragt, stellt der Kunde die erforderlichen Zugänge bereit.',
        'Vereinbarte, aber vom Kunden nicht abgerufene Videos verfallen mit Ablauf des jeweiligen Kalendermonats, sofern der Grund dafür nicht von der Agentur zu vertreten ist. Eine Übertragung in den Folgemonat oder eine Erstattung findet nicht statt.',
      ] },
      { titel: '§ 4 Mitwirkung des Kunden', absaetze: [
        'Der Kunde stellt der Agentur rechtzeitig alle für die Leistungserbringung erforderlichen Informationen, Materialien und Zugänge zur Verfügung, insbesondere Logo, Speisekarte, Angebote, Öffnungszeiten sowie Zugang zu den Räumlichkeiten am vereinbarten Drehtermin.',
        'Vereinbarte Drehtermine sind verbindlich. Sagt der Kunde einen Termin weniger als 48 Stunden vorher ab oder ist der Dreh aus Gründen, die der Kunde zu vertreten hat, nicht durchführbar, gilt der Termin als erbracht und wird abgerechnet.',
        'Kommt der Kunde seinen Mitwirkungspflichten trotz Aufforderung in Textform und angemessener Nachfrist nicht nach, ruhen die Leistungspflichten der Agentur. Der Vergütungsanspruch bleibt bestehen.',
      ] },
      { titel: '§ 5 Freigabe und Korrekturen', absaetze: [
        'Die Agentur legt die fertigen Videos dem Kunden zur Freigabe vor.',
        'Der Kunde teilt Änderungswünsche innerhalb von fünf Werktagen ab Vorlage in Textform mit. Änderungswünsche einer Schleife sind gesammelt und vollständig zu übermitteln. Erfolgt innerhalb der Frist keine Rückmeldung, gilt das Video als freigegeben.',
        `Je Video ${mehrzahl} in der Vergütung enthalten.${zweite}`,
        `Nach Aufwand mit ${satz(v.stundensatz)} netto je angefangener Stunde vergütet werden Änderungswünsche, die über die enthaltenen Schleifen hinausgehen, die erst nach Ablauf der Rückmeldefrist eingehen oder die den ursprünglich abgestimmten Rahmen verlassen. Als Verlassen des Rahmens gelten insbesondere ein geändertes Konzept, ein anderer Schnittstil sowie der Austausch von Musik oder Sprecher. Ein erforderlicher Nachdreh wird als zusätzlicher Drehtermin behandelt und gesondert vergütet.`,
      ] },
      { titel: '§ 6 Nutzungsrechte', absaetze: [
        'Die Agentur räumt dem Kunden an den freigegebenen Videos das räumlich und zeitlich unbeschränkte, nicht ausschließliche Recht ein, diese für eigene werbliche Zwecke zu nutzen, insbesondere auf den eigenen Social-Media-Kanälen, der eigenen Website und in eigener Werbung.',
        'Die Rechteeinräumung erfolgt aufschiebend bedingt durch die vollständige Zahlung der vereinbarten Vergütung. Bis dahin ist die Nutzung nur widerruflich gestattet.',
        'Eine Bearbeitung der Videos durch den Kunden oder Dritte sowie eine Weitergabe an Dritte zur eigenen werblichen Nutzung bedarf der vorherigen Zustimmung der Agentur in Textform.',
        'Enthalten Videos Musik, die nur über die Plattformlizenz von Instagram oder TikTok genutzt werden darf, ist die Verwendung auf diese Plattformen beschränkt. Die Agentur weist auf betroffene Videos hin.',
      ] },
      { titel: '§ 7 Rechte Dritter, abgebildete Personen', absaetze: [
        'Der Kunde stellt sicher, dass er an allen von ihm bereitgestellten Materialien — insbesondere Logos, Bildern, Texten und Markenzeichen — über die erforderlichen Rechte verfügt.',
        'Werden Personen erkennbar abgebildet, insbesondere Mitarbeitende oder Gäste, holt der Kunde deren Einwilligung in Bild- und Tonaufnahmen sowie in die Veröffentlichung ein und bewahrt sie auf. Auf Verlangen legt er sie der Agentur vor.',
        'Der Kunde stellt die Agentur von Ansprüchen Dritter frei, die aus einer Verletzung der Pflichten nach Absatz 1 oder 2 entstehen, einschließlich angemessener Kosten der Rechtsverteidigung.',
      ] },
      { titel: '§ 8 Zahlung und Zusatzkosten', absaetze: [
        'Bei Zahlungsverzug ist die Agentur berechtigt, Verzugszinsen in gesetzlicher Höhe zu verlangen und die weitere Leistungserbringung bis zum Ausgleich offener Forderungen einzustellen.',
        `Reisekosten außerhalb von ${v.reisekostenOrt} sowie Kosten für Dritte, insbesondere Lizenzen, Darsteller oder Requisiten, werden nach vorheriger Abstimmung gesondert berechnet.`,
        'Zusätzliche Videos über die in § 2 vereinbarte Anzahl hinaus werden nur nach vorheriger Abstimmung in Textform produziert und gesondert berechnet.',
      ] },
      { titel: '§ 9 Laufzeit und Kündigung', absaetze: [
        `Dieser Rahmenvertrag beginnt am ${dat(v.beginn)} und läuft auf unbestimmte Zeit.`,
        `Eine Mindestlaufzeit besteht nicht. Der Vertrag kann von beiden Seiten mit einer Frist von ${v.kuendigungsfrist} in Textform gekündigt werden und ist damit monatlich kündbar.`,
        'Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
        'Bis zum Ende der Laufzeit bleiben die Leistungs- und Zahlungspflichten für den laufenden Monat in vollem Umfang bestehen.',
        'Nach Vertragsende übergibt die Agentur dem Kunden die freigegebenen Videos in üblicher Qualität. Projektdateien und Rohmaterial sind nicht Vertragsgegenstand.',
      ] },
      { titel: '§ 10 Referenznennung', absaetze: [
        'Die Agentur ist berechtigt, den Kunden unter Nennung des Namens und Verwendung des Logos sowie die für ihn erstellten Videos als Referenz zu nennen und zu zeigen. Der Kunde kann dem jederzeit in Textform widersprechen.',
      ] },
      { titel: '§ 11 Vertraulichkeit und Datenschutz', absaetze: [
        'Beide Seiten behandeln vertrauliche Informationen der jeweils anderen Seite vertraulich. Dies gilt auch nach Vertragsende fort.',
        'Soweit die Agentur im Auftrag des Kunden personenbezogene Daten verarbeitet, schließen die Parteien einen gesonderten Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.',
        'Zugangsdaten zu Social-Media-Konten werden ausschließlich für die vertraglich vereinbarten Zwecke verwendet und nach Vertragsende auf Verlangen gelöscht.',
      ] },
      { titel: '§ 12 Haftung', absaetze: [
        'Die Agentur haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung von Leben, Körper oder Gesundheit.',
        'Bei einfacher Fahrlässigkeit haftet die Agentur nur bei Verletzung einer wesentlichen Vertragspflicht und begrenzt auf den vertragstypischen, vorhersehbaren Schaden.',
        'Für Sperrungen, Löschungen oder Reichweitenveränderungen durch die Plattformbetreiber haftet die Agentur nicht, soweit sie diese nicht zu vertreten hat.',
      ] },
      { titel: '§ 13 Schlussbestimmungen', absaetze: [
        'Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform. Dies gilt auch für die Änderung dieser Klausel.',
        'Der Vertrag wird elektronisch geschlossen. Die Parteien sind sich einig, dass die Bestätigung über den zugesandten Link der Schriftform gleichsteht, soweit gesetzlich keine strengere Form vorgeschrieben ist.',
        'Es gilt das Recht der Bundesrepublik Deutschland.',
        `Ausschließlicher Gerichtsstand für alle Streitigkeiten aus diesem Vertrag ist ${v.gerichtsstand}, sofern der Kunde Kaufmann, juristische Person des öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen ist.`,
        'Sollte eine Bestimmung dieses Vertrags unwirksam sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.',
      ] },
    ],
  }
}

// Vorbelegung aus den Firmendaten (Einstellungen)
export function agenturAus(co: Company): ContractParty {
  return {
    name: co.name || 'Sow & Loynab Media GbR',
    vertreten: null,
    adresse: co.address || null,
  }
}

// Steuersatz, den die Agentur normalerweise ansetzt: Kleinunternehmer -> 0.
export function ustAus(co: Company): number {
  if (co.kleinunternehmer) return 0
  return co.defaultVat ?? 19
}

// Alte Verträge (Version 1) kennen den Block noch nicht — damit die Anzeige
// nicht auf undefined läuft.
export function konditionenVon(b: ContractBody | null | undefined): Konditionen {
  const k = b?.konditionen
  return {
    videos: k?.videos ?? null,
    netto: k?.netto ?? null,
    ust: k?.ust ?? null,
    brutto: k?.brutto ?? null,
    rechnung: { name: k?.rechnung?.name ?? null, adresse: k?.rechnung?.adresse ?? null, email: k?.rechnung?.email ?? null },
  }
}
