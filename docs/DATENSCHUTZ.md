# Datenschutz / DSGVO – Minimum-Checkliste

Das Dashboard verarbeitet **personenbezogene Daten** (Kunden, Kontakte, Rechnungen,
E-Mails). Das ist kein Code-Thema, sondern Pflicht als Unternehmen. Hier das
Minimum, damit ihr auf der sicheren Seite seid. Punkte abarbeiten und dokumentieren.

> Ich bin kein Anwalt — im Zweifel eine:n Datenschutzberater:in kurz drüberschauen lassen.

## 1. Auftragsverarbeitungs-Verträge (AV-Verträge / DPA)

Ihr gebt Daten an Dienstleister weiter → mit jedem braucht ihr einen AV-Vertrag:

- [ ] **Supabase** — DPA abschließen (im Supabase-Dashboard unter *Organization → Legal/DPA* verfügbar).
- [ ] **Zoho** — DPA (Zoho stellt eins bereit; im Zoho-Admin bzw. auf der Zoho-Website).
- [ ] **Apify** (falls Auto-Statistik genutzt wird) — DPA prüfen.
- [ ] **Anthropic / OpenAI** (falls KI-Texte/Sprache genutzt werden) — DPA/Terms prüfen; keine echten Kundennamen unnötig in Prompts.

## 2. Serverstandort EU

- [ ] **Supabase-Projekt-Region prüfen** — sollte **EU** sein (z. B. Frankfurt).
      Supabase → Project Settings → General → Region. (Region lässt sich nachträglich
      nicht ändern — falls US, mit Support/Neu-Anlage klären.)
- [ ] **Zoho** auf der **EU**-Instanz betreiben (`.eu`) — passt zu den Standard-Einstellungen
      der App (`ZOHO_MAIL_BASE = https://mail.zoho.eu`).

## 3. Zugriff & Technik (ist größtenteils erledigt)

- [x] Datenbank-Zugriff nur für eingeloggtes Team (Row Level Security aktiv).
- [x] API-Schlüssel liegen als Secrets (nicht im Code, nicht im Browser).
- [x] Login per E-Mail/Passwort (Supabase Auth).
- [ ] **Starke, individuelle Passwörter** fürs Team; kein geteilter Sammel-Login, wo vermeidbar.
- [ ] Regelmäßiges Backup (Supabase macht automatische Backups — Aufbewahrung im Plan prüfen).

## 4. Öffentliche Freigabe-Seite (`/freigabe/…`)

Diese Seite ist öffentlich erreichbar. Sie zeigt nur den freigegebenen Content,
keine Kundenliste. Trotzdem:

- [ ] Auf eurer Website ein **Impressum + Datenschutzerklärung** haben und den Link
      an Kunden mitgeben, wenn ihr Freigabe-Links verschickt.

## 5. Betroffenenrechte

- [ ] **Löschkonzept**: Auf Anfrage müsst ihr Daten löschen können. In der App:
      Kunde/Lead → Papierkorb → endgültig löschen. Für Rechnungen gilt allerdings die
      **gesetzliche Aufbewahrungsfrist (i. d. R. 10 Jahre)** — die dürfen NICHT einfach
      gelöscht werden.
- [ ] **Auskunft**: Bei Anfrage müsst ihr sagen können, welche Daten ihr speichert
      (Kunden, Kontakte, Rechnungen, ggf. Mails).

## 6. E-Mails im Dashboard

- [ ] Der Postfach-Abruf zieht echte Kunden-Mails in eure Datenbank. Das ist ok, solange
      Region EU + AV-Verträge stehen. Bewusst sein: **gelöschte Mails im Postfach** landen
      im Archiv (`archived=true`), nicht endgültig weg — bei Bedarf ein echtes Löschen ergänzen.

---

**Kurzfassung:** Technisch seid ihr sauber aufgestellt. Die offenen Punkte sind
**vertraglich/organisatorisch** (AV-Verträge, EU-Region bestätigen, Impressum, Löschkonzept).
Einmal abarbeiten, kurz dokumentieren — fertig.
