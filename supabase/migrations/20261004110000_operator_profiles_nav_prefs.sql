-- Customizable operator sidebar (pin/unpin nav items into "Mehr"), per
-- account rather than per device. Default '{}' = nothing unpinned, i.e.
-- today's behaviour is unchanged until someone actually unpins something.
alter table operator_profiles
  add column if not exists nav_unpinned_items text[] not null default '{}';
