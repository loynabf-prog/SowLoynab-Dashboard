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

*(0001–0009 bzw. `ALLES_offen_5-9.sql` sollten schon gelaufen sein — sonst zuerst die.)*

## 2. Secrets (Supabase → Edge Functions → Secrets)

- [ ] `ANTHROPIC_API_KEY` — für Caption/Ideen/Sprachbefehl (Claude)
- [ ] `OPENAI_API_KEY` — für Sprache-zu-Text (Whisper)
- [ ] `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — für Push-Benachrichtigungen
- [ ] `APIFY_TOKEN` — für die Auto-Statistik
- [ ] `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`,
      `ZOHO_FROM_ADDRESS` — für Mail senden/empfangen (→ `docs/ZOHO_MAIL_SETUP.md`)
- [ ] `ZOHO_MAIL_BASE` / `ZOHO_ACCOUNTS_BASE` — nur falls `.com` statt `.eu`

## 3. Funktionen deployen + „Enforce JWT"

`supabase functions deploy <name>` — danach im Dashboard die JWT-Einstellung prüfen:

| Funktion | JWT | Zweck |
|----------|-----|-------|
| `generate-caption` | AN | Bildunterschriften |
| `generate-ideas` | AN | Ideen-Vorschläge |
| `voice-command` | AN | Sprachbefehl |
| `send-push` | AN | Push senden |
| `mail-send` | **AN** | Rechnung/Mail verschicken |
| `daily-reminders` | **AUS** | täglicher Reminder-Cron |
| `refresh-stats` | **AUS** | Statistik-Cron |
| `mail-sync` | **AUS** | Postfach-Abruf-Cron |

## 4. Zeitpläne (Cron) einrichten

Jeweils Projekt-Ref + Anon-Key eintragen und im SQL Editor ausführen:

- [ ] `supabase/functions/daily-reminders/cron-setup.sql`
- [ ] `supabase/functions/refresh-stats/cron-setup.sql`
- [ ] `supabase/functions/mail-sync/cron-setup.sql`

## 5. In der App

- [ ] **Mehr → Einstellungen**: Firmendaten ausfüllen (Pflicht für Rechnungen)
- [ ] **Zoho anbinden**: Schritte in `docs/ZOHO_MAIL_SETUP.md`
- [ ] Push erlauben (Handy fragt beim ersten Mal)
- [ ] Auto-Statistik: bei den Videos die TikTok-/Instagram-Links hinterlegen

---

## Noch nicht gebaut / bewusst geparkt

- **Auto-Posting** (automatisch veröffentlichen) — geparkt bis ~50–100 Uploads/Monat.
- **Offizielle Reichweiten-API** (statt Apify) — später, wenn Volumen steigt.
- **Anhänge aus eingehenden Mails** herunterladen — auf Zuruf.
- **Mehrere Rechnungs-Positionen** (Einzelposten) — Feld `items` liegt bereit.
