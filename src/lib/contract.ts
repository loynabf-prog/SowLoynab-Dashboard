import type { Company } from './settings'

// Der Rahmenvertrag als Datenstruktur. Aus derselben Quelle entstehen die
// Ansicht im Dashboard, die Seite zum Unterschreiben und das PDF — so kann
// nirgends eine abweichende Fassung entstehen.
export interface ContractParty {
  name: string
  vertreten?: string | null
  adresse?: string | null
}
export interface ContractBody {
  version: number
  titel: string
  agentur: ContractParty
  kunde: ContractParty
  // Kaufmännische Eckdaten, die im Text auftauchen
  stundensatz: number | null      // € netto für Zusatzaufwand
  kuendigungsfrist: string        // z. B. "vier Wochen zum Monatsende"
  gerichtsstand: string
  reisekostenOrt: string
  korrekturschleifen: number
  beginn: string | null           // ISO-Datum
  paragraphen: { titel: string; absaetze: string[] }[]
}

export interface ContractVars {
  agentur: ContractParty
  kunde: ContractParty
  stundensatz: number | null
  kuendigungsfrist: string
  gerichtsstand: string
  reisekostenOrt: string
  korrekturschleifen: number
  beginn: string | null
}

const zahlwort = (n: number) => ['null', 'eine', 'zwei', 'drei', 'vier', 'fünf'][n] ?? String(n)
const satz = (n: number | null) => (n == null ? '[Stundensatz]' : `${n.toLocaleString('de-DE')} €`)
const dat = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : '[Datum]'

// Baut den vollständigen Vertragstext. Wird beim Versenden einmal erzeugt und
// dann als Kopie gespeichert — spätere Änderungen an dieser Vorlage berühren
// bereits unterschriebene Verträge nicht.
export function buildContract(v: ContractVars): ContractBody {
  const n = v.korrekturschleifen
  const mehrzahl = n === 1 ? 'ist eine Korrekturschleife' : `sind ${zahlwort(n)} Korrekturschleifen`
  const zweite = n > 1
    ? ' Die jeweils folgende Schleife darf nur Punkte betreffen, die bereits in der ersten Rückmeldung genannt wurden.'
    : ''

  return {
    version: 1,
    titel: 'Rahmenvertrag über Social-Media-Videoproduktion',
    agentur: v.agentur,
    kunde: v.kunde,
    stundensatz: v.stundensatz,
    kuendigungsfrist: v.kuendigungsfrist,
    gerichtsstand: v.gerichtsstand,
    reisekostenOrt: v.reisekostenOrt,
    korrekturschleifen: n,
    beginn: v.beginn,
    paragraphen: [
      { titel: '§ 1 Gegenstand des Vertrags', absaetze: [
        'Die Agentur erbringt für den Kunden Leistungen der Konzeption, Produktion und Veröffentlichung von Kurzvideos für soziale Netzwerke, insbesondere Instagram und TikTok.',
        'Dieser Rahmenvertrag regelt die allgemeinen Bedingungen. Der konkrete Umfang je Zeitraum oder Projekt — Anzahl der Videos, Vergütung und Leistungszeitraum — wird gesondert vereinbart, insbesondere durch ein Angebot der Agentur, das der Kunde in Textform annimmt. Die dortige Vereinbarung wird Bestandteil dieses Vertrags.',
        'Die Agentur schuldet die vereinbarte Produktion und Veröffentlichung, nicht einen bestimmten wirtschaftlichen Erfolg. Reichweiten, Aufrufzahlen und Neukunden hängen von Faktoren ab, die außerhalb des Einflussbereichs der Agentur liegen, insbesondere von den Algorithmen der Plattformen.',
      ] },
      { titel: '§ 2 Leistungsumfang', absaetze: [
        'Soweit nichts anderes vereinbart ist, umfasst ein Video: Konzeption, Dreh, Schnitt, Vertonung, Untertitel sowie die Erstellung einer Bildunterschrift.',
        'Drehtermine finden nach vorheriger Abstimmung in den Räumlichkeiten des Kunden statt.',
        'Die Veröffentlichung erfolgt über die Kanäle des Kunden. Ist die Agentur mit der Veröffentlichung beauftragt, stellt der Kunde die erforderlichen Zugänge bereit.',
        'Vereinbarte, aber vom Kunden nicht abgerufene Videos verfallen mit Ablauf des jeweiligen Leistungszeitraums, sofern der Grund dafür nicht von der Agentur zu vertreten ist. Eine Übertragung in den Folgemonat oder eine Erstattung findet nicht statt.',
      ] },
      { titel: '§ 3 Mitwirkung des Kunden', absaetze: [
        'Der Kunde stellt der Agentur rechtzeitig alle für die Leistungserbringung erforderlichen Informationen, Materialien und Zugänge zur Verfügung, insbesondere Logo, Speisekarte, Angebote, Öffnungszeiten sowie Zugang zu den Räumlichkeiten am vereinbarten Drehtermin.',
        'Vereinbarte Drehtermine sind verbindlich. Sagt der Kunde einen Termin weniger als 48 Stunden vorher ab oder ist der Dreh aus Gründen, die der Kunde zu vertreten hat, nicht durchführbar, gilt der Termin als erbracht und wird abgerechnet.',
        'Kommt der Kunde seinen Mitwirkungspflichten trotz Aufforderung in Textform und angemessener Nachfrist nicht nach, ruhen die Leistungspflichten der Agentur. Der Vergütungsanspruch bleibt bestehen.',
      ] },
      { titel: '§ 4 Freigabe und Korrekturen', absaetze: [
        'Die Agentur legt die fertigen Videos dem Kunden zur Freigabe vor.',
        'Der Kunde teilt Änderungswünsche innerhalb von fünf Werktagen ab Vorlage in Textform mit. Änderungswünsche einer Schleife sind gesammelt und vollständig zu übermitteln. Erfolgt innerhalb der Frist keine Rückmeldung, gilt das Video als freigegeben.',
        `Je Video ${mehrzahl} in der Vergütung enthalten.${zweite}`,
        `Nach Aufwand mit ${satz(v.stundensatz)} netto je angefangener Stunde vergütet werden Änderungswünsche, die über die enthaltenen Schleifen hinausgehen, die erst nach Ablauf der Rückmeldefrist eingehen oder die den ursprünglich abgestimmten Rahmen verlassen. Als Verlassen des Rahmens gelten insbesondere ein geändertes Konzept, ein anderer Schnittstil sowie der Austausch von Musik oder Sprecher. Ein erforderlicher Nachdreh wird als zusätzlicher Drehtermin behandelt und gesondert vergütet.`,
      ] },
      { titel: '§ 5 Nutzungsrechte', absaetze: [
        'Die Agentur räumt dem Kunden an den freigegebenen Videos das räumlich und zeitlich unbeschränkte, nicht ausschließliche Recht ein, diese für eigene werbliche Zwecke zu nutzen, insbesondere auf den eigenen Social-Media-Kanälen, der eigenen Website und in eigener Werbung.',
        'Die Rechteeinräumung erfolgt aufschiebend bedingt durch die vollständige Zahlung der vereinbarten Vergütung. Bis dahin ist die Nutzung nur widerruflich gestattet.',
        'Eine Bearbeitung der Videos durch den Kunden oder Dritte sowie eine Weitergabe an Dritte zur eigenen werblichen Nutzung bedarf der vorherigen Zustimmung der Agentur in Textform.',
        'Enthalten Videos Musik, die nur über die Plattformlizenz von Instagram oder TikTok genutzt werden darf, ist die Verwendung auf diese Plattformen beschränkt. Die Agentur weist auf betroffene Videos hin.',
      ] },
      { titel: '§ 6 Rechte Dritter, abgebildete Personen', absaetze: [
        'Der Kunde stellt sicher, dass er an allen von ihm bereitgestellten Materialien — insbesondere Logos, Bildern, Texten und Markenzeichen — über die erforderlichen Rechte verfügt.',
        'Werden Personen erkennbar abgebildet, insbesondere Mitarbeitende oder Gäste, holt der Kunde deren Einwilligung in Bild- und Tonaufnahmen sowie in die Veröffentlichung ein und bewahrt sie auf. Auf Verlangen legt er sie der Agentur vor.',
        'Der Kunde stellt die Agentur von Ansprüchen Dritter frei, die aus einer Verletzung der Pflichten nach Absatz 1 oder 2 entstehen, einschließlich angemessener Kosten der Rechtsverteidigung.',
      ] },
      { titel: '§ 7 Vergütung und Zahlung', absaetze: [
        'Die Vergütung ergibt sich aus der jeweiligen Einzelvereinbarung nach § 1 Absatz 2. Sämtliche Beträge verstehen sich netto zuzüglich der gesetzlichen Umsatzsteuer.',
        'Die Abrechnung erfolgt monatlich im Voraus, sofern nichts anderes vereinbart ist.',
        'Rechnungen sind innerhalb von 14 Tagen ab Rechnungsdatum ohne Abzug zur Zahlung fällig.',
        'Bei Zahlungsverzug ist die Agentur berechtigt, Verzugszinsen in gesetzlicher Höhe zu verlangen und die weitere Leistungserbringung bis zum Ausgleich offener Forderungen einzustellen.',
        `Reisekosten außerhalb von ${v.reisekostenOrt} sowie Kosten für Dritte, insbesondere Lizenzen, Darsteller oder Requisiten, werden nach vorheriger Abstimmung gesondert berechnet.`,
      ] },
      { titel: '§ 8 Laufzeit und Kündigung', absaetze: [
        `Dieser Rahmenvertrag beginnt am ${dat(v.beginn)} und läuft auf unbestimmte Zeit.`,
        `Der Vertrag kann von beiden Seiten mit einer Frist von ${v.kuendigungsfrist} in Textform gekündigt werden. Eine befristete Einzelvereinbarung läuft bis zu ihrem Ende weiter.`,
        'Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.',
        'Nach Vertragsende übergibt die Agentur dem Kunden die freigegebenen Videos in üblicher Qualität. Projektdateien und Rohmaterial sind nicht Vertragsgegenstand.',
      ] },
      { titel: '§ 9 Referenznennung', absaetze: [
        'Die Agentur ist berechtigt, den Kunden unter Nennung des Namens und Verwendung des Logos sowie die für ihn erstellten Videos als Referenz zu nennen und zu zeigen. Der Kunde kann dem jederzeit in Textform widersprechen.',
      ] },
      { titel: '§ 10 Vertraulichkeit und Datenschutz', absaetze: [
        'Beide Seiten behandeln vertrauliche Informationen der jeweils anderen Seite vertraulich. Dies gilt auch nach Vertragsende fort.',
        'Soweit die Agentur im Auftrag des Kunden personenbezogene Daten verarbeitet, schließen die Parteien einen gesonderten Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO.',
        'Zugangsdaten zu Social-Media-Konten werden ausschließlich für die vertraglich vereinbarten Zwecke verwendet und nach Vertragsende auf Verlangen gelöscht.',
      ] },
      { titel: '§ 11 Haftung', absaetze: [
        'Die Agentur haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung von Leben, Körper oder Gesundheit.',
        'Bei einfacher Fahrlässigkeit haftet die Agentur nur bei Verletzung einer wesentlichen Vertragspflicht und begrenzt auf den vertragstypischen, vorhersehbaren Schaden.',
        'Für Sperrungen, Löschungen oder Reichweitenveränderungen durch die Plattformbetreiber haftet die Agentur nicht, soweit sie diese nicht zu vertreten hat.',
      ] },
      { titel: '§ 12 Schlussbestimmungen', absaetze: [
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
