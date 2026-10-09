-- Shop design per park: font + photo rotation, plus the brand presets copied from
-- each park's claim page. Project: kvpcwlcfgmsmarjtwpsx (already applied).
alter table public.park_shop_settings
  add column if not exists font_family text not null default 'system',
  add column if not exists photo_rotation integer not null default 0;

alter table public.park_shop_settings drop constraint if exists park_shop_settings_font_family_check;
alter table public.park_shop_settings
  add constraint park_shop_settings_font_family_check check (font_family ~ '^[a-z0-9-]{1,40}$');
alter table public.park_shop_settings drop constraint if exists park_shop_settings_photo_rotation_check;
alter table public.park_shop_settings
  add constraint park_shop_settings_photo_rotation_check check (photo_rotation in (0, 90, 180, 270));

insert into public.park_shop_settings (park_id, accent_color, shop_name, welcome_text, logo_url, font_family, photo_rotation) values
 ('85c77b81-9f9b-4b4e-9f70-9c6ffa0b9b14', '#C6A233', 'Alpine Coaster Foto-Shop', 'EINFACH abGEfahren – hol dir dein Foto vom Alpine Coaster als Download, Abzug oder auf Tasse, T-Shirt und mehr.', '/shop-brands/imst-logo.svg', 'system', 0),
 ('e2da6436-6a83-4c39-add3-5f99eb6bd897', '#0099CC', 'Tarzāns Sigulda', 'Feel the wind in your hair – hol dir dein Foto von der Toboggan Track als Download, Abzug oder auf Tasse, T-Shirt und mehr.', '/shop-brands/tarzans-logo.svg', 'palanquin', 270),
 ('3b08e092-beb5-46ec-9811-5698e86dd83a', '#0B2545', 'Plosebob Foto-Shop', 'Die Sommerrodelbahn am Fuß der Dolomiten – hol dir dein Foto als Download, Abzug oder auf Tasse, T-Shirt und mehr.', '/shop-brands/plose-logo.png', 'system', 0),
 ('25c1022b-4e2e-4fc4-b54d-72a4ced2522b', '#30A85B', 'Grünberg-Flitzer', 'Die Sommerrodelbahn am Traunsee in Gmunden – hol dir dein Foto als Download, Abzug oder auf Tasse, T-Shirt und mehr.', '/shop-brands/gruenberg-logo.svg', 'figtree', 0)
on conflict (park_id) do update set accent_color = excluded.accent_color, shop_name = excluded.shop_name, welcome_text = excluded.welcome_text, logo_url = excluded.logo_url, font_family = excluded.font_family, photo_rotation = excluded.photo_rotation;
