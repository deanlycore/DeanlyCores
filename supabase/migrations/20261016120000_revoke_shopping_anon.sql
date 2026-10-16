-- Anon loses every privilege on the shopping tables, including truncate.
-- Authenticated grants and row level security stay as they are.

revoke all privileges on table public.shopping_lists from anon;
revoke all privileges on table public.shopping_items from anon;
revoke all privileges on table public.pantry_items from anon;

revoke truncate on table public.shopping_lists from anon;
revoke truncate on table public.shopping_items from anon;
revoke truncate on table public.pantry_items from anon;
