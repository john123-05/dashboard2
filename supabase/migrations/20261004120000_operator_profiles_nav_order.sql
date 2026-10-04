-- Custom drag-reordered position of sidebar nav items, per account. Stores
-- the full ordered list of routes (NavItem.to); items not present in it
-- (new nav entries added later, or before anyone has ever reordered) keep
-- their default position, appended after the known ones.
alter table operator_profiles
  add column if not exists nav_item_order text[] not null default '{}';
