-- Signed-out /join must not call peek_household_invite_code as anon.
-- The server action checks the code with the service role after its per-IP limit.
-- Authenticated keeps execute. The other invite-code functions are unchanged.

revoke execute on function public.peek_household_invite_code(text) from public, anon;
grant execute on function public.peek_household_invite_code(text) to service_role, authenticated;

comment on function public.peek_household_invite_code(text) is
  'Called only server-side via service_role from the rate-limited /join check; anon revoked. Dropped with email sign-up.';
