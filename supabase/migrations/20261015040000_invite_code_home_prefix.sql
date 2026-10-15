-- New invite codes use HOME-. Issued DEAN- codes stay valid and can still be redeemed.

alter table public.household_invite_codes
  drop constraint household_invite_codes_code_format;

alter table public.household_invite_codes
  add constraint household_invite_codes_code_format check (
    code ~ '^(DEAN|HOME)-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$'
  );

create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path to 'public'
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  raw bytea := extensions.gen_random_bytes(8);
  body text := '';
  i int;
begin
  for i in 0..7 loop
    body := body || substr(alphabet, 1 + (get_byte(raw, i) % length(alphabet)), 1);
  end loop;
  return 'HOME-' || body;
end;
$$;
