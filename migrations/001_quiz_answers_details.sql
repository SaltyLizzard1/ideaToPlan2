-- Migration 001: assessment answers and per match details on quiz_results
--
-- NOT APPLIED. Review, then run it yourself in the Supabase SQL editor
-- against the project that serves ideatoplan.to.
--
-- Additive only. Every column is nullable or defaulted, so the code running
-- in production today keeps working after this runs, and it can run before
-- the new code deploys.
--
-- quiz_results as it stands (confirmed in the SQL editor, 27 Sept 2026):
--   id          text        not null
--   matches     jsonb       not null
--   created_at  timestamptz default now()
--   site        text        not null default 'qylat'
--
-- The table is shared with QYLAT. Nothing here reads or writes a
-- site = 'qylat' row, and set_quiz_detail takes the site as an argument so
-- an IdeaToPlan write cannot reach a QYLAT row.

begin;

-- The six assessment fields, stored with the result so the detail stage can
-- see what the founder actually answered. Nullable: rows written before this
-- migration have no answers and must stay readable.
alter table public.quiz_results
  add column if not exists answers jsonb;

-- One validated detail per match, keyed by the match's position in the
-- matches array as a string, for example {"0": {...}, "3": {...}}.
-- Defaulted rather than nullable so no reader has to handle null and no
-- backfill is needed: every existing row reads as "no details yet", and
-- because those rows already hold full matches, they render as they always
-- did.
alter table public.quiz_results
  add column if not exists details jsonb not null default '{}'::jsonb;

-- Write one detail without reading the row first.
--
-- Seven details are generated in parallel. A read-modify-write of the whole
-- details object from the app would let the last writer drop the other six,
-- because each request would write back the object it read at the start.
-- jsonb_set on distinct keys inside one statement cannot lose a sibling.
--
-- Returns the number of rows updated. The route treats anything other than 1
-- as a failure rather than a silent no-op.
create or replace function public.set_quiz_detail(
  p_id text,
  p_site text,
  p_index int,
  p_detail jsonb
) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated int;
begin
  if p_index < 0 or p_index > 6 then
    raise exception 'set_quiz_detail: index % is outside 0 to 6', p_index;
  end if;

  if p_detail is null or jsonb_typeof(p_detail) <> 'object' then
    raise exception 'set_quiz_detail: detail must be a json object';
  end if;

  update public.quiz_results
     set details = jsonb_set(coalesce(details, '{}'::jsonb), array[p_index::text], p_detail, true)
   where id = p_id
     and site = p_site;

  get diagnostics updated = row_count;
  return updated;
end;
$$;

-- Execute on a new function is granted to public by default. Only the
-- service role, which is the key the server routes use, should be able to
-- write a detail.
revoke all on function public.set_quiz_detail(text, text, int, jsonb) from public;
revoke all on function public.set_quiz_detail(text, text, int, jsonb) from anon;
revoke all on function public.set_quiz_detail(text, text, int, jsonb) from authenticated;
grant execute on function public.set_quiz_detail(text, text, int, jsonb) to service_role;

commit;

-- Verify after running:
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'quiz_results'
--  order by ordinal_position;
--
-- Expect answers jsonb YES null, details jsonb NO '{}'::jsonb.
