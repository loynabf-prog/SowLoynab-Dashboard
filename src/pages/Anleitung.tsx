// /anleitung: Wie das CRM gedacht ist -- zum Nachlesen, fuer Lion und fuer
// alle, die spaeter dazukommen. Keine Funktion, nur Erklaerung. Lebt im CRM,
// damit sie immer da ist, wo man sie braucht.

import { Link } from 'react-router-dom'
import {
  Sun, Compass, Flame, CalendarDays, CalendarRange, BarChart3, Users, BookOpen,
  Pizza, Camera, Inbox, Eye, Send, Bell, Smartphone, CheckCircle2, type LucideIcon,
} from 'lucide-react'
import '../styles/pilot.css'

function Kapitel({ icon: I, farbe, titel, kinder }: { icon: LucideIcon; farbe: string; titel: string; kinder: React.ReactNode }) {
  return (
    <section className="an-kapitel">
      <h2><span className={`n-ic ${farbe}`}><I strokeWidth={2.2} /></span>{titel}</h2>
      <div className="an-text">{kinder}</div>
    </section>
  )
}

const STUFEN = [
  ['Teig', 'Eine Videoidee. Noch kein Material. Kommt aus dem Lexikon oder aus dem Kopf.'],
  ['Belegt', 'Rohmaterial ist da — der Drehtag war. Die Clips liegen im Briefkasten bzw. im Arbeitsordner.'],
  ['Bestellzettel', 'Das Briefing steht, das Video wartet vor dem Ofen. Reihenfolge schiebt ihr selbst.'],
  ['Im Ofen', 'Claude schneidet. Fortschritt sichtbar. Jeder hat seinen eigenen Ofen (Fassies PC, Lions Mac).'],
  ['Raus', 'Die Vorschau ist fertig und liegt unter der Wärmelampe. Es klingelt. Anschauen: servieren oder zurück in den Ofen.'],
  ['Teller', 'Bereit zum Posten. Beste Qualität liegt in „3 Zum Posten“. Der Pilot plant den Posting-Tag.'],
  ['Gegessen', 'Gepostet. Links und Zahlen kommen automatisch, die Datei wandert ins Archiv.'],
]

export default function Anleitung() {
  return (
    <div className="page an-seite">
      <div className="pl-kopf">
        <span className="pl-marke"><BookOpen strokeWidth={2.2} /></span>
        <div>
          <h1>Anleitung</h1>
          <p>Wie das CRM gedacht ist — in zehn Minuten.</p>
        </div>
      </div>

      <div className="an-intro">
        <p><strong>Ein Satz:</strong> Ihr dreht. Claude schneidet. Das CRM sagt, was fehlt, bevor es brennt — und postet nach Plan.</p>
        <p>Alles, was wiederkommt, macht das System. Ihr entscheidet nur an zwei Stellen: <em>Was wird gedreht?</em> und <em>Ist die Vorschau gut?</em></p>
      </div>

      <Kapitel icon={Pizza} farbe="glut" titel="1 · Die Pizzeria" kinder={<>
        <p>Jedes Video ist eine Pizza. Die Stufen sind überall dieselben — in der Backstube, in der Kundenakte, im Pilot:</p>
        <ol className="an-stufen">
          {STUFEN.map(([n, t]) => <li key={n}><strong>{n}</strong><span>{t}</span></li>)}
        </ol>
        <p>Kundenkontingente sind <strong>Bestellungen</strong>: „Hajo 15, Kraftfeld 10“. Der Pilot rechnet damit.</p>
      </>} />

      <Kapitel icon={Sun} farbe="glut" titel="2 · Heute" kinder={<>
        <p>Die Startseite. Oben <strong>die eine Sache, die jetzt dran ist</strong> (Post, Drehtag, Termin) mit einem Knopf. Nach links wischen = erledigt, nach rechts = später.</p>
        <p>Darunter <strong>„Bevor es brennt“</strong>: der Pilot mit seinen drei wichtigsten Vorschlägen, dann die Backstube. Jeder sieht nur seine Kunden.</p>
      </>} />

      <Kapitel icon={Compass} farbe="tinte" titel="3 · Pilot" kinder={<>
        <p>Der Pilot ist der Kopf des CRMs. Er zeigt nicht, was da ist, sondern <strong>was fehlt</strong>. Für jeden Kunden rechnet er:</p>
        <ul>
          <li><strong>Monat:</strong> gepostet gegen Ziel — und wo der Kunde heute nach Plan stehen müsste. Die kleine Marke auf dem Balken ist das Soll. Rot nur bei Vertragskunden.</li>
          <li><strong>Prognose:</strong> „bei diesem Tempo 12 von 15“ — gedeckelt durch das, was wirklich an Material da ist.</li>
          <li><strong>Vorrat für 30 Tage:</strong> Rest dieses Monats plus anteilig der nächste. Reicht Teller + Ofen + Zutaten nicht, braucht es einen <strong>Drehtag</strong>. Reichen die Ideen nicht für den Dreh, braucht es <strong>Ideen</strong>.</li>
          <li><strong>Fluss:</strong> fertige Videos ohne Posting-Tag, Pizzen unter der Lampe, ein leerer Ofen bei vollem Kühlschrank.</li>
          <li><strong>Pflege:</strong> fehlende Links, alte Zahlen, Vormonat ohne Rechnung, lange Pausen, auslaufende Verträge.</li>
          <li><strong>Lernen:</strong> läuft ein Video doppelt so gut wie sonst, schlägt er „Mehr davon“ vor und legt die Idee an.</li>
        </ul>
        <p><strong>Jeder Vorschlag hat genau einen Knopf.</strong> „Einplanen“ verteilt die fertigen Videos selbst auf freie Tage, zur Uhrzeit, die bei diesem Kunden am besten lief. „Drehtag planen“ legt den Drehtag mit der fehlenden Zahl an und hängt die Ideen dran. Die Vorschläge stehen auch morgens als Push auf dem Handy.</p>
        <p><strong>Kontrollstempel:</strong> Hast du einen Kunden durchgesehen (alle Posts im CRM, Links da, Zahlen geholt), tippst du in der Kundenakte auf „Kontrolle“ und setzt den Stempel „geprüft bis heute“ — oder schließt den Vormonat komplett ab. Alles vor dem Stempel gilt als sauber; der Pilot erinnert nur noch an das, was danach kommt. Steht der Stempel am Monatsende, ist der Monat grün (Haken in der Kundenakte und im Piloten). Posten darf man danach trotzdem.</p>
        <p>Was der Pilot <em>nicht</em> tut: nörgeln. Ist alles im Plan, sagt er „Keine Einwände“ und ist still.</p>
      </>} />

      <Kapitel icon={Flame} farbe="glut" titel="4 · Backstube (Ofen)" kinder={<>
        <p>Die Produktionsseite im Vollbild. Links die Zutaten, dann die Bestellzettel an der Schiene, der Ofen mit Fließband, die Ausgabe unter der Wärmelampe, die Teller.</p>
        <ul>
          <li><strong>Anwerfen:</strong> Bestellzettel antippen → das Video geht in deinen Ofen. Die Automatik schneidet; läuft ein Chat, meldet er sich im Ofen an.</li>
          <li><strong>Raus:</strong> es klingelt. Pizza antippen → <strong>eigener Claude-Chat pro Video</strong> mit Vorschau. Änderungen sagst du mündlich. „Passt“ → serviert.</li>
          <li><strong>Servieren:</strong> die beste Datei wandert nach „3 Zum Posten“, das Video liegt auf dem Teller.</li>
          <li><strong>Reihenfolge:</strong> Bons nach vorn oder hinten schieben. Jeder Ofen backt nur die Kunden seines Besitzers.</li>
        </ul>
      </>} />

      <Kapitel icon={Inbox} farbe="blau" titel="5 · Dropbox — der eine manuelle Schritt" kinder={<>
        <p>Nach dem Drehtag: alle Clips markieren und nach <code>1 Briefkasten/&lt;Kunde&gt;</code> ziehen. <strong>Das ist alles.</strong></p>
        <p>Ab da: der Wächter wartet zehn Minuten Ruhe, sortiert die Clips zu den Ideen, legt für Extra-Material neue Ideen an und schiebt bekannte Formate in den Ofen. Arbeitsordner sind <code>2 In Arbeit/&lt;Kunde&gt; - &lt;Idee&gt;</code>, fertige Dateien <code>3 Zum Posten</code>. Nach dem Posten (TikTok- und Instagram-Link da) wandert alles ins Archiv, das ihr nicht seht und Claude trotzdem hat.</p>
      </>} />

      <Kapitel icon={CalendarDays} farbe="glut" titel="6 · Kalender (Plan)" kinder={<>
        <p>Was wann rausgeht — die Seite, die der Kunde sieht. Der Pilot füllt sie: fertige Videos bekommen Tag und Uhrzeit automatisch. Ihr verschiebt nur, wenn euch etwas nicht passt. „Gepostet“ antippen holt Links und erste Zahlen selbst.</p>
      </>} />

      <Kapitel icon={CalendarRange} farbe="gruen" titel="7 · Monat" kinder={<>
        <p>Je Monat: welcher Kunde wie viele Videos bekommt und was reinkommt. Startet mit „Kunden &amp; Videos“ — jeder Name öffnet die Akte, jedes Video öffnet das Video. Der Monatsplan ist die Bestellung, mit der der Pilot rechnet; ein Eintrag mit 0 heißt „diesen Monat nicht dabei“.</p>
      </>} />

      <Kapitel icon={Users} farbe="blau" titel="8 · Kundenakte" kinder={<>
        <p>Oben drei Knöpfe: Idee, Gepostet, Bearbeiten. Dann der Pilot für diesen Kunden (Balken, Prognose, Stufen, Vorschläge). Dann drei Tabs: <strong>Videos · Analyse · Ideen</strong>. Alles andere liegt unter „Mehr zum Kunden“.</p>
        <p>Ideen kommen aus dem <strong>Lexikon</strong>: Formate und Ideen je Branche, aus Nachbarbranchen übernommen, nie vom Konkurrenten kopiert.</p>
      </>} />

      <Kapitel icon={BarChart3} farbe="lila" titel="9 · Analyse" kinder={<>
        <p>Jedes Video wird an seinem eigenen Kunden gemessen (Index 1,0 = typischer Post, 2,0 = doppelt so gut). So lassen sich Kunden mit 800 und 50.000 Followern vergleichen. Beste Zeiten, was wirkt, Top-Videos, Spätzünder. Pro Kunde in der Akte, gesamt unter „Analyse“. Der Pilot nutzt dieselben Zahlen für „Mehr davon“ und für die Uhrzeit beim Einplanen.</p>
      </>} />

      <Kapitel icon={Bell} farbe="gelb" titel="10 · Was von selbst passiert" kinder={<>
        <ul>
          <li><Smartphone size={14} /> Morgens ein Push: heutige Posts und die drei wichtigsten Pilot-Vorschläge — nur an den, den es angeht.</li>
          <li><Eye size={14} /> Pizza raus → es klingelt bei dem, dem der Ofen gehört.</li>
          <li><Send size={14} /> „Gepostet“ → Links, Caption und Zahlen holen sich selbst; Zahlen werden regelmäßig aufgefrischt.</li>
          <li><Camera size={14} /> Briefkasten voll → Clips sortieren, Ideen anlegen, Ofen anwerfen.</li>
          <li><CheckCircle2 size={14} /> Überall gepostet → Datei ins Archiv, Arbeitsordner weg.</li>
        </ul>
      </>} />

      <Kapitel icon={Sun} farbe="gruen" titel="Dein Tag in drei Minuten" kinder={<>
        <ol className="an-routine">
          <li><strong>Morgens:</strong> Push lesen. Heute öffnen. Die eine Sache oben erledigen.</li>
          <li><strong>Pilot:</strong> Knöpfe drücken — Einplanen, Drehtag, Mehr davon. Fertig in einer Minute.</li>
          <li><strong>Wenn es klingelt:</strong> Pizza antippen, Vorschau anschauen, im Chat sagen, was anders soll. Oder „Passt“.</li>
          <li><strong>Nach dem Dreh:</strong> Clips in den Briefkasten. Sonst nichts.</li>
          <li><strong>Monatsanfang:</strong> Monat abschließen, Rechnung raus — der Pilot erinnert ab dem 3.</li>
        </ol>
        <p>Mehr nicht. Alles, was hier nicht steht, soll das CRM alleine können — und wenn nicht, sag es Claude im Chat: „ab jetzt soll …“.</p>
      </>} />

      <p className="an-fuss"><Link to="/pilot">Zum Piloten →</Link></p>
    </div>
  )
}
