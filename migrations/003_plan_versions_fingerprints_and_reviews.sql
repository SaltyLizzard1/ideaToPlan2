-- 003: plan versions carry their content and fingerprints; human review records.
-- Prepared 2026-10-06. To be run by Liz in the Supabase SQL editor. One transaction: any failure rolls back everything.
-- No existing row is rewritten: every new column is nullable with no default.

begin;

-- PART 1. A version carries its own content and fingerprints.
alter table public.plan_versions
  add column plan_text text,
  add column sources_cited jsonb,
  add column plan_sha256 text check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  add column pdf_sha256 text check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  add column origin text check (origin in ('generated', 'hand_corrected')),
  add column parent_version_id uuid references public.plan_versions(id),
  add column approved_plan_sha256 text,
  add column approved_pdf_sha256 text,
  add constraint plan_versions_fingerprints_together check (
    (plan_text is null) = (plan_sha256 is null) and (plan_sha256 is null) = (pdf_sha256 is null)
  );

-- PART 2. Human review records. Insert-only. Written only from the Supabase dashboard.
create table public.plan_reviews (
  id uuid primary key default gen_random_uuid(),
  plan_version_id uuid not null references public.plan_versions(id),
  decision text not null check (decision in ('release_for_approval', 'keep_on_hold', 'note')),
  reviewer text not null check (length(btrim(reviewer)) > 0),
  incomplete_checks_disposition text not null check (length(btrim(incomplete_checks_disposition)) > 0),
  notes text,
  record_ref text,
  redelivery_reason text,
  ai_prepared_by text,
  automated_review_status text,
  automated_review_notes text,
  plan_sha256 text,
  pdf_sha256 text,
  recorded_by text not null default current_user,
  created_at timestamptz not null default now()
);

create unique index plan_reviews_one_release
  on public.plan_reviews (plan_version_id) where decision = 'release_for_approval';

create function public.plan_reviews_guard() returns trigger
language plpgsql as $$
declare v public.plan_versions%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Review records cannot be changed or deleted. Add a new record.';
  end if;
  select * into v from public.plan_versions where id = new.plan_version_id;
  if not found then
    raise exception 'Plan version % does not exist.', new.plan_version_id;
  end if;
  if new.decision = 'release_for_approval' and v.plan_sha256 is null then
    raise exception 'Plan version % has no fingerprints and cannot be released.', v.id;
  end if;
  -- Copied from the version, never typed: the record describes exactly this text, this PDF and this automated result.
  new.automated_review_status := v.review_status;
  new.automated_review_notes := v.review_notes;
  new.plan_sha256 := v.plan_sha256;
  new.pdf_sha256 := v.pdf_sha256;
  new.recorded_by := current_user;
  new.created_at := now();
  return new;
end $$;

create trigger plan_reviews_guard
  before insert or update or delete on public.plan_reviews
  for each row execute function public.plan_reviews_guard();

alter table public.plan_reviews enable row level security;
revoke all on public.plan_reviews from public, anon, authenticated, service_role;
grant select on public.plan_reviews to service_role;

-- PART 3. Content cannot change after insert, and a fingerprinted version cannot be sent without approval.
-- Status, approved_at, sent_at and gmail_message_id stay updatable. A version without fingerprints (every row that
-- exists before this migration) is not subject to the approval rule, so the existing workflows keep working.
create function public.plan_versions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.plan_text is not null
       and new.plan_sha256 is distinct from encode(sha256(convert_to(new.plan_text, 'UTF8')), 'hex') then
      raise exception 'plan_sha256 does not match plan_text. No version was written.';
    end if;
    if new.approved_plan_sha256 is not null or new.approved_pdf_sha256 is not null then
      raise exception 'A version cannot be inserted as already approved.';
    end if;
    if new.plan_sha256 is not null and new.status in ('sending', 'sent') then
      raise exception 'A fingerprinted version cannot be inserted as %.', new.status;
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.submission_id is distinct from old.submission_id
     or new.version is distinct from old.version
     or new.pdf_path is distinct from old.pdf_path
     or new.created_at is distinct from old.created_at
     or new.plan_text is distinct from old.plan_text
     or new.sources_cited is distinct from old.sources_cited
     or new.plan_sha256 is distinct from old.plan_sha256
     or new.pdf_sha256 is distinct from old.pdf_sha256
     or new.origin is distinct from old.origin
     or new.parent_version_id is distinct from old.parent_version_id
     or new.review_status is distinct from old.review_status
     or new.review_notes is distinct from old.review_notes
  then
    raise exception 'The content and the automated review of a plan version cannot be changed. Create a new version.';
  end if;

  -- The approved fingerprints are written once, when an awaiting_approval version is claimed for sending.
  if new.approved_plan_sha256 is distinct from old.approved_plan_sha256
     or new.approved_pdf_sha256 is distinct from old.approved_pdf_sha256 then
    if old.approved_plan_sha256 is not null or old.approved_pdf_sha256 is not null then
      raise exception 'The approved fingerprints of a plan version cannot be changed.';
    end if;
    if old.status is distinct from 'awaiting_approval' or new.status is distinct from 'sending' then
      raise exception 'Approved fingerprints are recorded only when an awaiting_approval version is claimed for sending.';
    end if;
  end if;

  -- Whenever a fingerprinted version enters sending or sent, whatever else the update changes:
  -- its approved fingerprints must be its own, and a matching human release record must exist.
  if new.plan_sha256 is not null
     and new.status in ('sending', 'sent')
     and new.status is distinct from old.status then
    if new.approved_plan_sha256 is null or new.approved_pdf_sha256 is null
       or new.approved_plan_sha256 is distinct from new.plan_sha256
       or new.approved_pdf_sha256 is distinct from new.pdf_sha256 then
      raise exception 'Plan version % cannot become %: its approved fingerprints are missing or are not its own.', new.id, new.status;
    end if;
    if not exists (
      select 1 from public.plan_reviews r
      where r.plan_version_id = new.id and r.decision = 'release_for_approval'
        and r.plan_sha256 = new.plan_sha256 and r.pdf_sha256 = new.pdf_sha256
    ) then
      raise exception 'Plan version % cannot become %: no matching human release record exists.', new.id, new.status;
    end if;
  end if;
  return new;
end $$;

create trigger plan_versions_guard
  before insert or update on public.plan_versions
  for each row execute function public.plan_versions_guard();

commit;
