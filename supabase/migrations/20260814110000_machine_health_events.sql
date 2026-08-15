/*
  Dauerhafter Verlauf der Automaten-Meldungen

  Warum
  -----
  Der Heartbeat schreibt nach liftpic_machine_configs.last_status - und
  ueberschreibt dieses Feld jede Minute. Damit ist immer nur der AKTUELLE
  Zustand sichtbar. Eine Stoerung, die zwischen zwei Heartbeats auftrat und sich
  wieder erledigt hat, hinterlaesst keine Spur; ebensowenig ein
  Verbindungsabbruch, waehrend dessen der Server gar nichts erfaehrt.

  Der Agent puffert solche Meldungen seit dem 14.08.2026 lokal in SQLite und
  liefert sie nach, sobald er den Server wieder erreicht (Feld
  `buffered_events` im Heartbeat). Diese Tabelle ist ihr dauerhafter Platz.

  Eigenschaften
  -------------
  - Eindeutigkeit ueber (machine_id, occurred_at, summary): dieselbe Meldung
    derselben Maschine zur selben Zeit ist dieselbe Meldung, egal wie oft sie
    geliefert wird. Bewusst als normaler Unique-Index statt als generierte
    Spalte - eine Umwandlung von timestamptz nach text haengt von der
    Zeitzonen-Einstellung ab und ist daher als generierte Spalte nicht erlaubt.
  - Kein Fremdschluessel auf parks: die Zeile soll auch dann erhalten bleiben,
    wenn ein Park spaeter aufgeraeumt wird - der Verlauf ist Betriebsdoku.
  - RLS ist aktiv ohne Policy: Zugriff ausschliesslich ueber Edge Functions mit
    Service-Rolle, wie bei liftpic_machine_configs.
*/

create table if not exists public.liftpic_machine_health_events (
  id bigserial primary key,
  park_id uuid not null,
  machine_id text not null,
  occurred_at timestamptz not null,
  kind text not null,
  severity text not null,
  summary text not null,
  detail text,
  received_at timestamptz not null default now()
);

create unique index if not exists liftpic_machine_health_events_dedupe_idx
  on public.liftpic_machine_health_events (machine_id, occurred_at, summary);

create index if not exists liftpic_machine_health_events_lookup_idx
  on public.liftpic_machine_health_events (park_id, occurred_at desc);

alter table public.liftpic_machine_health_events enable row level security;
