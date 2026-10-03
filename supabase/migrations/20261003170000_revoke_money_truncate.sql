revoke truncate on table public.money_cards from authenticated, anon, public;
revoke truncate on table public.money_people from authenticated, anon, public;
revoke truncate on table public.money_payments from authenticated, anon, public;
revoke update on table public.money_payments from authenticated, anon, public;
revoke references on table public.money_cards, public.money_people, public.money_payments from authenticated, anon, public;
revoke trigger on table public.money_cards, public.money_people, public.money_payments from authenticated, anon, public;
