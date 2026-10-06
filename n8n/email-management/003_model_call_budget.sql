-- Email management: a counted limit on model calls, enforced in the database.
-- Run by Liz in the Supabase SQL editor, as one script. Adds one table and one function. Alters and drops nothing.
--
-- Why: the handler now runs one execution per email, and executions can overlap. A count kept inside n8n
-- cannot stop two of them taking the last call at the same moment. One UPDATE on one row can.

begin;

create table public.email_model_budget (
  scope       text primary key check (scope <> ''),
  max_calls   integer not null check (max_calls >= 0),
  used        integer not null default 0 check (used >= 0 and used <= max_calls),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Asks for one model call under a named limit.
--   allowed = true    the call is counted and may be made
--   allowed = false   the limit is used up: make no call
-- The limit for a scope is fixed by its first claim. A later, lower p_max lowers it for that claim.
-- A higher p_max does not raise it: raising a limit means changing the row by hand.
create function public.email_claim_model_call(p_scope text, p_max integer)
returns table (allowed boolean, calls_used integer, calls_max integer)
language plpgsql security invoker set search_path = public as $$
declare
  b public.email_model_budget%rowtype;
begin
  if coalesce(p_scope, '') = '' or p_max is null or p_max < 0 then
    raise exception 'email_claim_model_call needs a scope and a limit of zero or more';
  end if;

  insert into email_model_budget (scope, max_calls) values (p_scope, p_max)
  on conflict (scope) do nothing;

  -- The row is locked by the update, so two claims for the same scope run one after the other.
  update email_model_budget e
     set used = e.used + 1, updated_at = now()
   where e.scope = p_scope and e.used < least(e.max_calls, p_max)
  returning e.* into b;

  if found then
    return query select true, b.used, b.max_calls;
  else
    return query select false, e.used, e.max_calls from email_model_budget e where e.scope = p_scope;
  end if;
end $$;

alter table public.email_model_budget enable row level security;
revoke all on public.email_model_budget from anon, authenticated;
grant select, insert, update on public.email_model_budget to service_role;
revoke all on function public.email_claim_model_call(text, integer) from public, anon, authenticated;
grant execute on function public.email_claim_model_call(text, integer) to service_role;

commit;

-- Check after running (read-only). Expect one row, rowsecurity true, and no budget rows yet.
select t.tablename, t.rowsecurity,
       (select count(*) from public.email_model_budget) as budget_rows,
       (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'email_claim_model_call') as functions
  from pg_tables t where t.schemaname = 'public' and t.tablename = 'email_model_budget';
