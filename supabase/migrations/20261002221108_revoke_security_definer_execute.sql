-- Revoke EXECUTE on security-definer helpers that are not part of the public API.
-- Not applied on project dpjzlitklsjtfrfrxvhl. Review before applying.
--
-- Live signatures checked against pg_proc on that project (2026-10-02).
-- They match the functions in this repo:
--   public.seed_default_categories(p_household_id uuid)
--   public.handle_new_user()
--   public.can_access_row(p_household_id uuid, p_visibility public.visibility, p_owner_id uuid)
--   public.is_household_member(p_household_id uuid)
-- peek_household_invite_code(p_code text) is unchanged. Anon still peeks on the join page.
--
-- Current ACLs include an explicit postgres=X grant, separate from PUBLIC (=X).
-- create_household(text) and redeem_household_invite_code(text, text) are
-- security definer and owned by postgres, so they still call seed_default_categories.
-- authenticated keeps its explicit EXECUTE on can_access_row and is_household_member
-- because RLS policies call those functions.
--
-- handle_new_user() is the AFTER INSERT trigger on auth.users. supabase_auth_admin
-- is not a superuser and is not named in the ACL, so it only has EXECUTE through
-- PUBLIC. Revoking PUBLIC without a replacement grant would make new logins fail
-- inside that trigger. EXECUTE is granted back to supabase_auth_admin only.

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;

revoke execute on function public.can_access_row(uuid, public.visibility, uuid) from public, anon;
revoke execute on function public.is_household_member(uuid) from public, anon;
