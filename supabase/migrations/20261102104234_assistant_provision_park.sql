begin;
create schema if not exists assistant_private;
revoke all on schema assistant_private from public,anon,authenticated;
grant usage on schema assistant_private to service_role;
create table assistant_private.provisioned_parks(park_id uuid primary key references public.parks(id),payload jsonb not null,created_at timestamptz not null default now());
alter table assistant_private.provisioned_parks enable row level security;
revoke all on assistant_private.provisioned_parks from public,anon,authenticated,service_role;
grant select,insert on assistant_private.provisioned_parks to service_role;
create function public.assistant_provision_park(p_park jsonb,p_operator jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare existing public.parks; orgid uuid; stored jsonb; pid uuid:=(p_park->>'id')::uuid; payload jsonb:=jsonb_build_object('park',p_park,'operator',p_operator);
begin
 perform pg_advisory_xact_lock(hashtextextended(pid::text,0));
 select x.payload into stored from assistant_private.provisioned_parks x where x.park_id=pid;
 if found then
  if stored<>payload then raise exception 'Provisioning request changed'; end if;
  return jsonb_build_object('ok',true,'park_id',pid);
 end if;
 select * into existing from public.parks where id=pid;
 if found then
  if nullif(p_operator->>'organization_id','') is null or existing.organization_id<>(p_operator->>'organization_id')::uuid
   or existing.name<>p_park->>'name' or existing.slug<>p_park->>'slug' then raise exception 'Existing operator park differs'; end if;
 else
  if nullif(p_operator->>'organization_id','') is not null then
   select id into orgid from public.organizations where id=(p_operator->>'organization_id')::uuid;
   if orgid is null then raise exception 'Organization not found'; end if;
  else
   if length(trim(coalesce(p_operator->>'new_organization_name','')))=0 then raise exception 'Organization required'; end if;
   insert into public.organizations(name,slug) values(p_operator->>'new_organization_name','liftpic-'||pid::text) returning id into orgid;
  end if;
  insert into public.parks(id,organization_id,name,slug,timezone) values(pid,orgid,p_park->>'name',p_park->>'slug',p_park->>'timezone');
 end if;
 insert into assistant_private.provisioned_parks(park_id,payload) values(pid,payload);
 return jsonb_build_object('ok',true,'park_id',pid);
end $$;
revoke all on function public.assistant_provision_park(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.assistant_provision_park(jsonb,jsonb) to service_role;
commit;
