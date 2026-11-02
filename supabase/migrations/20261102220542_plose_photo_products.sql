-- Additive, Plose-only pilot. No live payments or live fulfilment enabled.
create table public.park_photo_product_shops (
 park_id uuid primary key references public.parks(id), enabled boolean not null default false,
 mode text not null default 'sandbox' check(mode='sandbox'),
 prices jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table public.photo_product_quotes (
 id uuid primary key default gen_random_uuid(), park_id uuid not null references public.parks(id),
 token_hash text not null, country text not null check(country in ('IT','DE','AT')),
 items jsonb not null, supplier_quote jsonb not null, totals jsonb not null,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes'
);
create table public.photo_product_orders (
 id uuid primary key default gen_random_uuid(), park_id uuid not null references public.parks(id),
 quote_id uuid not null unique references public.photo_product_quotes(id), token_hash text not null,
 is_test boolean not null default true check(is_test), status text not null default 'awaiting_payment',
 stripe_session_id text unique, provider_order_id text unique, recipient jsonb,
 items jsonb not null, totals jsonb not null, country text not null,
 dispatch_started_at timestamptz, provider_status jsonb, error_code text,
 created_at timestamptz not null default now(), paid_at timestamptz, updated_at timestamptz not null default now()
);
create index photo_product_orders_park_created on public.photo_product_orders(park_id,created_at desc);
create table public.photo_product_request_limits (
 id bigint generated always as identity primary key, fingerprint text not null,
 created_at timestamptz not null default now()
);
create index photo_product_request_limits_key on public.photo_product_request_limits(fingerprint,created_at desc);
alter table public.park_photo_product_shops enable row level security;
alter table public.photo_product_quotes enable row level security;
alter table public.photo_product_orders enable row level security;
alter table public.photo_product_request_limits enable row level security;
revoke all on public.park_photo_product_shops, public.photo_product_quotes, public.photo_product_orders, public.photo_product_request_limits from anon, authenticated;
grant all on public.park_photo_product_shops, public.photo_product_quotes, public.photo_product_orders, public.photo_product_request_limits to service_role;
grant usage on sequence public.photo_product_request_limits_id_seq to service_role;
insert into public.park_photo_product_shops(park_id,enabled) values ('3b08e092-beb5-46ec-9811-5698e86dd83a',true);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values ('photo-product-originals','photo-product-originals',false,25000000,array['image/jpeg','image/png']) on conflict(id) do nothing;
notify pgrst,'reload schema';
