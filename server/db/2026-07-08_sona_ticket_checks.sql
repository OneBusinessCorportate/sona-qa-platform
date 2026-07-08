-- Sona daily ticket-check confirmation + accountant response tracking + a
-- follow-up task tracker. All additive: existing sqa_* tables/behaviour are
-- unchanged. Scope stays strictly inside the Sona QA platform (sqa_*); nothing
-- here touches mqa_* (Margarita / AI communication QA) or kk_* (accountants').
--
-- The "detected checks" themselves are NOT a new table: each sqa_reviews row is
-- one technical check Sona performed, so it is the single source of truth for
-- the daily count. We only add two per-check response columns to it.

-- 1) Per-check accountant response + Sona's appeal decision.
--    accountant_response_status: NULL/'pending' | 'agreed' | 'appealed'
--    sona_appeal_decision:       NULL           | 'accepted' | 'rejected'
alter table public.sqa_reviews
  add column if not exists accountant_response_status text,
  add column if not exists sona_appeal_decision text;

alter table public.sqa_reviews drop constraint if exists sqa_reviews_acc_response_check;
alter table public.sqa_reviews add constraint sqa_reviews_acc_response_check
  check (accountant_response_status is null
         or accountant_response_status in ('pending', 'agreed', 'appealed'));

alter table public.sqa_reviews drop constraint if exists sqa_reviews_sona_appeal_check;
alter table public.sqa_reviews add constraint sqa_reviews_sona_appeal_check
  check (sona_appeal_decision is null
         or sona_appeal_decision in ('accepted', 'rejected'));

-- 2) Sona's confirmation of the detected daily count (one row per local day).
create table if not exists public.sqa_ticket_confirmations (
  check_date          date primary key,
  detected_total      integer not null default 0,
  corrected_total     integer,
  confirmation_status text not null default 'pending'
                        check (confirmation_status in ('pending','confirmed','incorrect','needs_review')),
  confirmed_by_sona   boolean not null default false,
  sona_comment        text,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.sqa_ticket_confirmations is
  'Sona''s confirmation of the bot-detected daily Sona ticket/check count. detected_total = what the shared counter found; corrected_total = Sona''s manual correction when incorrect.';

-- 3) Follow-up "accountant system tasks" tracker (appeals, corrections, manual).
create table if not exists public.sqa_accountant_tasks (
  id           text primary key default (gen_random_uuid())::text,
  task_date    date not null default current_date,
  accountant   text,
  review_id    text references public.sqa_reviews(id) on delete set null,
  ticket_id    text,
  description  text not null,
  status       text not null default 'open'
                 check (status in ('open','in_progress','done','cancelled')),
  priority     text,               -- mirrors sqa_tickets.priority when used
  source       text not null default 'manual'
                 check (source in ('sona_ticket_check','appeal','manual')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.sqa_accountant_tasks is
  'Follow-up queue for accountant system tasks raised from Sona ticket checks / appeals / manual entries.';

create index if not exists sqa_accountant_tasks_date_idx on public.sqa_accountant_tasks (task_date desc);
create index if not exists sqa_accountant_tasks_status_idx on public.sqa_accountant_tasks (status);

-- RLS: these tables are reached only through the server's service-role key
-- (like the other sqa_* tables), which bypasses RLS. Enable RLS with no
-- policies so the anon/authenticated keys cannot read or write them directly.
alter table public.sqa_ticket_confirmations enable row level security;
alter table public.sqa_accountant_tasks enable row level security;
