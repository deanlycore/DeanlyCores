-- Optional store and need-soon flags on the existing shopping list.
-- No parallel table. Older clients can still read name, checked_at, and visibility.

alter table public.shopping_items
  add column store text,
  add column need_soon boolean not null default false;

alter table public.shopping_items
  add constraint shopping_items_store_len
  check (store is null or char_length(btrim(store)) between 1 and 40);
