-- Explicit Kalahari dashboard/app access for the existing Liftpictures super-admins.
-- Preserve every existing park grant and never turn unrestricted access into a narrower list.
begin;
select pg_advisory_xact_lock(hashtextextended('kalahari-operator-access',0));
insert into public.organization_memberships(user_id,organization_id,role)
select u.id,'e6b64143-6815-4cf9-972f-c8a38cf530ca'::uuid,'org_owner' from auth.users u
where lower(u.email) in ('tomnotes.tn@gmail.com','john.m.nolting@gmail.com')
and not exists(select 1 from public.organization_memberships m where m.user_id=u.id and m.organization_id='e6b64143-6815-4cf9-972f-c8a38cf530ca');
update auth.users set raw_app_meta_data=jsonb_set(raw_app_meta_data,'{allowed_park_ids}',(raw_app_meta_data->'allowed_park_ids')||jsonb_build_array('cd65690a-3e83-414a-8e38-5482cfe1c482'))
where lower(email) in ('tomnotes.tn@gmail.com','john.m.nolting@gmail.com')
and jsonb_typeof(raw_app_meta_data->'allowed_park_ids')='array'
and not (raw_app_meta_data->'allowed_park_ids' ? 'cd65690a-3e83-414a-8e38-5482cfe1c482');
commit;
