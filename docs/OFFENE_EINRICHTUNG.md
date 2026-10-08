# Offene Einrichtung – Checkliste

Ein Ort für alles, was am PC/in Supabase noch eingerichtet werden muss, damit
alle Funktionen live sind. Von oben nach unten abhaken.

> Reihenfolge zählt bei den SQLs (0010 vor 0011 vor 0012 …).

---

## 1. Datenbank-Skripte (Supabase → SQL Editor → Run)

Falls du unsicher bist, was schon lief: Die Skripte sind mit `if not exists`
gebaut, ein erneuter Lauf schadet also nicht.

- [ ] `supabase/migrations/0010_approval.sql` — Kunden-Freigabe-Links
- [ ] `supabase/migrations/0011_live_stats.sql` — Auto-Statistik (Reichweite)
- [ ] `supabase/migrations/0012_invoice_pdf.sql` — Rechnungsfelder (Empfänger, USt …)
- [ ] `supabase/migrations/0013_mail.sql` — Postfach (Tabelle `mails`)
- [ ] `supabase/migrations/0014_system_status.sql` — Systemstatus (zeigt Hintergrund-Fehler)
- [ ] `supabase/migrations/0015_series.sql` — Wiederholungen/Serien (Aufgaben & Videos)
- [ ] `supabase/migrations/0016_task_category.sql` — Farb-Kategorien für Aufgaben
- [ ] `supabase/migrations/0017_video_category.sql` — Farb-Kategorie/Ring für Videos
- [ ] `supabase/migrations/0018_task_priority.sql` — Dringlichkeit/Priorität für Aufgaben
- [ ] `supabase/migrations/0019_client_contract.sql` — Vertragsende pro Kunde (Content-Plan)
- [ ] `supabase/migrations/0020_video_platform_stats.sql` — Zahlen getrennt nach Instagram/TikTok (Vergleich + Nachtragen)
- [ ] `supabase/migrations/0021_account_stats.sql` — Following/Posts-Anzahl pro Kunde (Account-Statistik)
- [ ] `supabase/migrations/0022_task_time.sql` — Uhrzeit für Aufgaben
- [ ] `supabase/migrations/0023_inspirations.sql` — Inspirationen (gemerkte Fremd-Videos)
- [ ] `supabase/migrations/0024_packages.sql` — Standard-Pakete (Basis / Wachstum / Marktführer)
- [ ] `supabase/migrations/0025_contracts.sql` — Rahmenverträge mit elektronischer Unterschrift
- [ ] `supabase/migrations/0026_client_brand.sql` — zwei Marken (Sow & Loynab Media / Creator Scout)
- [ ] `supabase/migrations/0027_client_type.sql` — Kundenart (zahlend / Ehrenamt-Referenz / passiv)
- [ ] `supabase/migrations/0028_client_accounts.sql` — **mehrere Social-Accounts pro Kunde**
      (zwei Instagram + zwei TikTok unter einem Namen). Übernimmt die vorhandenen
      Handles automatisch, es geht nichts verloren.
- [ ] `supabase/migrations/0029_client_channels.sql` — **Kanäle innerhalb eines Kunden**
      (zwei Betriebe unter einem Dach, je mit eigener Farbe). Macht aus vorhandenen
      Account-Namen direkt die Kanäle und ordnet Videos zu, wo der Posting-Link
      es eindeutig sagt.
- [ ] `supabase/migrations/0030_month_plans.sql` — **Videomenge je Monat**
      (Retainer mit Ausnahmen, z. B. 20 statt 16 im Oktober). Ohne Ausnahme gilt
      überall weiter der Retainer.
- [ ] `supabase/migrations/0031_vorarbeit.sql` — **gedreht / geschnitten / eingeplant**
      pro Video. Damit lässt sich der morgige Tag heute schon abhaken. Trägt bei
      bereits geposteten Videos alle drei nach.
- [ ] `supabase/migrations/0032_kalender_abo.sql` — **Termine** (Arbeitszeit, Spiel,
      Einzeltermin) und ein **Abo-Schlüssel je Teammitglied**, damit jeder den
      Dashboard-Kalender auf seinem Handy abonnieren kann.
- [ ] `supabase/migrations/0033_auto_links_caption.sql` — **Links kommen automatisch**
      (ein paar Minuten nach „Gepostet") und **Caption an der Idee**.

*(0029–0033 stecken gesammelt in `ALLES_offen_29-33.sql` — dann reicht ein Durchlauf.)*

*(0020–0023 stecken gesammelt in `ALLES_offen_20-23.sql`, 0024–0027 in
`ALLES_offen_24-27.sql` — dann reichen zwei Durchläufe statt acht.)*

*(0001–0009 bzw. `ALLES_offen_5-9.sql` sollten schon gelaufen sein — sonst zuerst die.)*

## 1b. Passwort vergessen — nur falls die Mail nicht ankommt

„Passwort vergessen?" steht auf der Login-Seite und braucht **kein** Skript und
**keinen** Deploy. Der Link kommt von Supabase selbst.

Kommt keine Mail an, liegt es an einer dieser zwei Stellen:

- [ ] **Authentication → URL Configuration → Site URL** muss
      `https://app.sowloynab.de` sein. Der Link aus der Mail führt dorthin; steht
      dort noch `localhost`, landet ihr im Nichts.
- [ ] **Project Settings → Authentication → SMTP Settings**: Der eingebaute
      Versand von Supabase ist auf wenige Mails pro Stunde begrenzt und liefert
      teilweise nur an Adressen, die im Projekt hinterlegt sind. Für verlässliche
      Zustellung dort **Custom SMTP** mit den Zoho-Daten eintragen — dieselben,
      die schon für den Rechnungsversand hinterlegt sind.

## 2. Secrets (Supabase → Edge Functions → Secrets)

- [ ] `ANTHROPIC_API_KEY` — für Caption/Ideen/Sprachbefehl (Claude)
- ~~`OPENAI_API_KEY`~~ — **nicht mehr nötig, aus den Secrets entfernt (15.09.2026).**
      Der Sprachbefehl nimmt kein Audio mehr auf; diktiert wird mit der Mikrofontaste
      der Handytastatur, an die Funktion geht nur noch Text.
      Offen: den Key **bei OpenAI selbst widerrufen** (platform.openai.com →
      Settings → API keys → Revoke). Solange er dort in der Liste steht, ist er
      gültig — egal ob er hier noch hinterlegt ist.
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — für Push-Benachrichtigungen
- [ ] `APIFY_TOKEN` — für die Auto-Statistik
- [ ] `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`,
      `ZOHO_FROM_ADDRESS` — für Mail senden/empfangen (→ `docs/ZOHO_MAIL_SETUP.md`)
- [ ] `ZOHO_MAIL_BASE` / `ZOHO_ACCOUNTS_BASE` — nur falls `.com` statt `.eu`

## 3. Funktionen deployen + „Enforce JWT"

`supabase functions deploy <name>` — danach im Dashboard die JWT-Einstellung prüfen:

| Funktion | JWT | Zweck |
|----------|-----|-------|
| `generate-caption` | AN | Captions — der Assistent schreibt damit, Hausstil kommt aus den Einstellungen |
| `generate-ideas` | AN | Ideen-Vorschläge |
| `assistent` | AN | **Assistent** — macht aus einem Auftrag einen Plan aus mehreren Schritten. Schreibt selbst nichts; ausgeführt wird in der App unter dem angemeldeten Nutzer. |
| ~~`voice-command`~~ | — | abgelöst durch `assistent`; kann gelöscht werden |
| `send-push` | AN | Push senden |
| `mail-send` | **AN** | Rechnung/Mail verschicken |
| `daily-reminders` | **AUS** | täglicher Reminder-Cron |
| `refresh-stats` | **AUS** | Video-Statistik-Cron (7 Tage täglich, dann wöchentlich/monatlich) |
| `refresh-account-stats` | **AUS** | Account-Statistik-Cron (Follower/Following/Posts, täglich) — **nach 0028 neu deployen** |
| `apify-lookup` | AN | Altes Video nachtragen (Sofort-Abruf) |
| `apify-profile` | AN | Profilbild + Followerzahl zu einem Handle — der Assistent setzt damit das Kundenlogo |
| `apify-places-search` | AN | Leads aus Google Maps suchen |
| `mail-sync` | **AUS** | Postfach-Abruf-Cron |
| `fetch-post-links` | **AUS** | holt die Posting-Adressen nach dem Posten selbst (alle 5 Min) |
| `calendar-feed` | **AUS** | Kalender-Abo fürs Handy — die Kalender-App kann sich nicht anmelden, der Schlüssel in der Adresse ist die Berechtigung |

## 4. Zeitpläne (Cron) einrichten

Jeweils Projekt-Ref + Anon-Key eintragen und im SQL Editor ausführen:

- [ ] `supabase/functions/daily-reminders/cron-setup.sql`
- [ ] `supabase/functions/refresh-stats/cron-setup.sql`
- [ ] `supabase/functions/refresh-account-stats/cron-setup.sql`
- [ ] `supabase/functions/mail-sync/cron-setup.sql`
- [ ] `supabase/functions/fetch-post-links/cron-setup.sql` — alle 5 Minuten

## 5. In der App

- [ ] **Kalender aufs Handy**: **Mehr → Team** → bei jedem Namen auf „Abonnieren".
      Das iPhone fragt „Kalender abonnieren?" — bestätigen, fertig. Danach stehen
      Posting-Tage, Aufgaben und Termine im normalen Kalender (und damit im
      Kalender-Widget). Jeder nimmt nur seinen eigenen Link; er zeigt die
      gemeinsamen Termine plus die eigenen. **Der Link ist ein Passwort** — nicht
      weitergeben; bei Handyverlust in der App auf „Neu".
      Braucht 0032 + `calendar-feed` deployed mit JWT **AUS**.
- [ ] **Mehr → Einstellungen → Feste Hashtags** eintragen. Die hängt der Assistent
      an jede Caption an, ohne dass du sie je wieder mitdiktieren musst.
- [ ] **Mehr → Einstellungen**: Firmendaten ausfüllen (Pflicht für Rechnungen)
- [ ] **Zoho anbinden**: Schritte in `docs/ZOHO_MAIL_SETUP.md`
- [ ] Push erlauben (Handy fragt beim ersten Mal)
- [ ] Auto-Statistik: bei den Videos die TikTok-/Instagram-Links hinterlegen
- [ ] Altes Video nachtragen: **＋ Neu → 🔗 Nachtragen** — Instagram-/TikTok-Link
      einfügen, „Daten abrufen", Kunde/Titel/Datum prüfen, anlegen. Braucht
      0020 + `apify-lookup` deployed + `APIFY_TOKEN`-Secret (oben, Punkt 2).
- [ ] Account-Statistik: bei den Kunden die Handles (Instagram/TikTok) hinterlegen
      → **Kunde bearbeiten → Social-Accounts**. Ein Kunde darf beliebig viele
      Accounts je Plattform haben (z. B. zwei Betriebe unter einem Namen); die
      Follower werden für den Kunden addiert, unter „📊 Wachstum" siehst du
      zusätzlich jeden Account einzeln. Follower/Following/Posts werden täglich
      automatisch nachgezogen. Braucht 0021 + 0028 +
      `refresh-account-stats` deployed + Cron eingerichtet.
- [ ] Leads aus Google Maps: **Leads → 🗺️ Google Maps** — Kategorie (z. B.
      Restaurant/Imbiss/Eisdiele) + Ort eingeben, suchen, auswählen,
      importieren. Braucht nur `apify-places-search` deployed +
      `APIFY_TOKEN`-Secret (oben, Punkt 2) — keine neue Migration nötig.
      Kostet ca. 4 $ pro 1.000 Treffer bei Apify.

---

## Noch nicht gebaut / bewusst geparkt

- **Auto-Posting** (automatisch veröffentlichen) — geparkt bis ~50–100 Uploads/Monat.
- **Offizielle Reichweiten-API** (statt Apify) — später, wenn Volumen steigt.
- **Anhänge aus eingehenden Mails** herunterladen — auf Zuruf.
- **Mehrere Rechnungs-Positionen** (Einzelposten) — Feld `items` liegt bereit.
