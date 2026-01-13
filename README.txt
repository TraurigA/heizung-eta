Heizungs-Logbuch – Release v3.2.8 (stabil + UI-Blöcke)
Build-Date: 2026-01-13

Dieses ZIP ist ein kompletter Stand (alle Dateien). Ziel von v3.2.8:
- Stabiler Start (Login reagiert wieder zuverlässig)
- Monatsauswertung repariert und robust (keine "is not defined" / kein Crash bei leeren Feldern)
- "Heute" übersichtlich in Blöcken (wie Gesamtübersicht)
- Einträge: "Hacks." heißt jetzt "Hackschnitzel"
- Hinweis zur Wartungstabelle wird in der App angezeigt

---

1) Deployment (GitHub Pages)
1. ZIP entpacken
2. Im GitHub-Repo alle Dateien ersetzen/überschreiben
3. Commit/Push (GitHub Pages deployed automatisch)

Danach im Browser:
- Falls du noch eine alte Version siehst: in der App "Update/Cache reset" drücken.
- Am PC (Chrome): DevTools → Application → Service Workers → Unregister → Reload (Strg+Shift+R).

---

2) Version prüfen
Oben rechts in der App steht die Version. Für diesen Stand muss dort "v3.2.8" stehen.

---

3) Wartung (optional)
Für Wartungen nutzt die App eine zusätzliche Supabase-Tabelle: maintenance_events.
Wenn du Wartung verwenden willst, lege die Tabelle einmalig in Supabase an:

-- Tabelle
create table if not exists public.maintenance_events (
  id bigserial primary key,
  user_id uuid not null,
  date date not null,
  note text,
  heat_total_kwh numeric,
  full_load_minutes integer,
  created_at timestamptz not null default now()
);

-- RLS aktivieren
alter table public.maintenance_events enable row level security;

-- Policy: Benutzer darf eigene Events lesen/schreiben
create policy "maintenance_select_own" on public.maintenance_events
  for select using (auth.uid() = user_id);

create policy "maintenance_insert_own" on public.maintenance_events
  for insert with check (auth.uid() = user_id);

create policy "maintenance_update_own" on public.maintenance_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "maintenance_delete_own" on public.maintenance_events
  for delete using (auth.uid() = user_id);

Hinweis: Wenn du die Tabelle nicht anlegst, funktioniert der Rest der App weiterhin – Wartungsfunktionen zeigen dann nur den Hinweis.

---

4) Was ist drin (Kurzliste der wichtigen Funktionen)
- Wärme: Gesamt, Wohnhaus (berechnet), Gebäude 2 / Rosi getrennt
- Strom: Heizung gesamt + Fernwärmeleitung/Pumpe (separat, ohne falsche Summen)
- Betrieb: Vollaststunden (h+min), Pufferladungen
- Hackschnitzel: Gesamt / seit Asche-Entleerung + Asche-Event
- Schaltzustände: HK Haus / HK Rosi / FBH Rosi + Status-Analyse
- Einträge: Liste + Löschen + Bearbeiten (Tagesdatensatz laden, korrigieren, speichern)
- Gesamtübersicht: Summen/letzte Zählerstände korrekt (keine falschen Additionen)
- Monatsauswertung & Jahresauswertung: robust gegen fehlende Werte
- Heizjahr-Logik (Start 04.09.) + Wartung als Event (separat vom Heizjahr)
- Changelog-Bereich (Einstellungen)

---

5) Troubleshooting (wenn die App „alt“ wirkt)
- In der App: "Update/Cache reset"
- PC: DevTools → Application → Service Workers → Unregister → Reload
- iPhone/PWA: ggf. App vom Homescreen entfernen und neu hinzufügen (nur wenn hartnäckig)

