-- Adds a note per contact-log entry, plus the ability to attach files
-- (images/PDFs) to a contact so staff can see exactly what was exchanged
-- and when. Purely additive: existing lead_contact_events rows and the
-- admin-lead-contacts function keep working unchanged.

alter table public.lead_contact_events add column if not exists note text;

create table if not exists public.lead_contact_attachments (
  id uuid primary key default gen_random_uuid(),
  contact_event_id uuid not null references public.lead_contact_events(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  mime_type text,
  file_size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_contact_attachments_event
  on public.lead_contact_attachments(contact_event_id);

alter table public.lead_contact_attachments enable row level security;
-- Deliberately no policies: exactly like lead_contact_events itself, every
-- read/write goes through the admin-lead-contact-attachments edge function
-- (service-role), never a direct client query.

insert into storage.buckets (id, name, public)
values ('lead-contact-attachments', 'lead-contact-attachments', false)
on conflict (id) do nothing;
-- No storage policies for anon/authenticated either — uploads and (signed,
-- time-limited) reads are both issued server-side by the same edge function.
