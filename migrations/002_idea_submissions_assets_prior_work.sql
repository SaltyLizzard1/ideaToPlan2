-- Migration 002: current-state intake answers on idea_submissions
--
-- APPLIED 2026-10-04 in the Supabase SQL editor against project
-- yglmlnfsyzsvozxirlpo, which serves ideatoplan.to. Verified afterwards:
-- four nullable columns, assets_in_place as jsonb, the other three as text.
--
-- Additive only. All four columns are nullable, so the code and the n8n workflow
-- running in production today keep working after this runs.
--
-- This had to run BEFORE switching the live n8n workflow to the v2 version. The
-- v2 "Log to Supabase" node writes all four columns and its insert fails if they
-- do not exist.
--
-- business_stage:  answer to "Where are you today?" as a stable value: idea,
--                  testing, built, launched, revenue, existing_new_offer.
--                  Empty or null means unknown.
-- assets_in_place: answer to "What do you already have in place?" as
--                  {"answered": true|false, "items": ["website", ...]}.
--                  answered = false  the founder skipped it: every item unknown
--                  answered = true   ticked items are in place, the rest are
--                                    not; an empty items list means "None of
--                                    these yet"
--                  Null (rows written before this migration) means unknown.
-- existing_assets: answer to "Add numbers or details if you can (optional)"
-- prior_work:      answer to "What have you already done? (optional)"
-- A null or empty value means the founder left the question blank. It is
-- unknown, not "none".

begin;

alter table public.idea_submissions
  add column if not exists business_stage text,
  add column if not exists assets_in_place jsonb,
  add column if not exists existing_assets text,
  add column if not exists prior_work text;

commit;
