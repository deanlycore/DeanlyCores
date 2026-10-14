-- New permission values. A later migration uses them.
-- Postgres cannot add an enum value and use it in the same transaction.

alter type public.member_role add value if not exists 'adult';
alter type public.member_role add value if not exists 'view_only';
