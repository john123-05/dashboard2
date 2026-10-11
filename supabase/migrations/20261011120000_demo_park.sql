-- Demo Park (docs/AUSBAU_PLAN.md, Phase DM): ein Park zum Vorführen. Alles ist freigeschaltet (Plan Marketing Pro,
-- Online-Shop, Speedmessung) und über den Schalter `demo` im Dashboard als „kostet extra“ gekennzeichnet.
-- Shared-Projekt kvpcwlcfgmsmarjtwpsx. Idempotent. Den Login (Nutzer + Organisation) legt Staff im CRM an.
insert into public.parks (name, slug, is_active, price_per_photo_cents)
select 'Demo Park', 'demo-park', true, 500
where not exists (select 1 from public.parks where slug = 'demo-park');

insert into public.park_entitlements (park_id, plan, features, status, source, notiz)
select p.id, 'marketing_pro', array['online_shop', 'speed', 'demo'], 'active', 'manual', 'Demo-Park zum Vorführen: alles frei, im Dashboard gekennzeichnet.'
from public.parks p where p.slug = 'demo-park'
on conflict (park_id) do update set plan = excluded.plan, features = excluded.features, status = excluded.status, notiz = excluded.notiz, updated_at = now();

insert into public.attractions (park_id, slug, name, is_active)
select p.id, 'demo-coaster', 'Demo Coaster', true from public.parks p
where p.slug = 'demo-park' and not exists (select 1 from public.attractions a where a.park_id = p.id);
