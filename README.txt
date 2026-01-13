Heizungs-Logbuch – Komplett-Update (v3.2.3)

Dieses ZIP enthält ALLE Dateien (index.html, app.js, config.js, manifest.json, sw.js, Icons).

Neu in v3:
- Heute: Feld "Wärme Wohnhaus (kWh, berechnet)" = Gesamt − Gebäude 2
- Einträge-Liste: zeigt Wärme-Zählerstände inkl. Wohnhaus (berechnet)
- Auswertung Monat/Jahr: Diagramm-Option "Wärme: Gesamt + Wohnhaus + Gebäude 2" (3 Kurven / 3 Balken)
- Auswertungen bleiben vollständig: Wärme, Strom, Vollaststunden, Pufferladungen, Hackschnitzel, etc. – pro Monat & pro Jahr

Update im GitHub Repo (ohne Zeilensuche):
- Öffne jede Datei (index.html / app.js / config.js / manifest.json / sw.js)
- ✏️ Edit -> STRG+A -> STRG+V -> Inhalt aus ZIP einfügen -> Commit changes

Wenn am iPhone noch alte Version angezeigt wird:
- App schließen & neu öffnen, oder Safari-Seite neu laden
- notfalls Website-Daten löschen / App neu hinzufügen (Service Worker Cache)


Neu in v3.2.3:
- Monatsauswertung stabilisiert (kein 'y is not defined')
- Tabs: Monatsauswertung/Jahresauswertung + Tab bleibt erhalten
- Gesamtübersicht (Zähler korrekt, Strom ohne falsche Summe, Vollaststunden als h/min)
- Einträge: Datum als Titel + Bearbeiten/Löschen
- Heute: Bereiche (Wärme/Strom/Betrieb/Hacks/Schaltzustände/Notiz)
- Changelog im Reiter Einstellungen
- Wartung (optional): benötigt Supabase-Tabelle 'maintenance_events'

Supabase SQL für Wartung (optional):
CREATE TABLE IF NOT EXISTS public.maintenance_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  day date NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  note text,
  snapshot jsonb
);
ALTER TABLE public.maintenance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "maintenance_select_own" ON public.maintenance_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "maintenance_insert_own" ON public.maintenance_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "maintenance_delete_own" ON public.maintenance_events FOR DELETE USING (auth.uid() = user_id);

Hinweis: Wenn du keine Wartungen nutzt, kannst du die Tabelle weglassen – die App zeigt dann einen Hinweis.

```sql
-- Optional: Wartungen speichern
create table if not exists public.maintenance_events (
  id bigserial primary key,
  user_id uuid not null,
  day date not null,
  ts timestamptz not null default now(),
  note text,
  snapshot jsonb
);

alter table public.maintenance_events enable row level security;

create policy "maintenance_events_select_own"
on public.maintenance_events for select
using (auth.uid() = user_id);

create policy "maintenance_events_insert_own"
on public.maintenance_events for insert
with check (auth.uid() = user_id);

create policy "maintenance_events_delete_own"
on public.maintenance_events for delete
using (auth.uid() = user_id);
```
