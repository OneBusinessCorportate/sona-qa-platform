-- «Что улучшить в платформе» — short survey Sona is nudged to fill after her
-- 3rd daily check (or in the evening). Additive; sqa_* scope only — nothing
-- here touches mqa_* (Margarita) or kk_* (accountants' app).
--
-- Reached only through the server's service-role key (like the other sqa_*
-- tables), so RLS is enabled with NO policies: the anon/authenticated keys
-- cannot read or write it directly.

create table if not exists public.sqa_platform_feedback (
  id            text primary key default (gen_random_uuid())::text,
  feedback_date date not null default current_date,
  reviewer      text,
  ease_rating   integer check (ease_rating is null or ease_rating between 1 and 5),
  slowed_down   text,       -- «что замедляло работу сегодня»
  improvements  text,       -- «что улучшить / чего не хватает»
  responses     jsonb not null default '{}'::jsonb, -- room for future questions
  created_at    timestamptz not null default now()
);

comment on table public.sqa_platform_feedback is
  'Sona''s answers to the short «что улучшить в платформе» survey, nudged after the 3rd daily check / in the evening.';

create index if not exists sqa_platform_feedback_date_idx
  on public.sqa_platform_feedback (feedback_date desc);

alter table public.sqa_platform_feedback enable row level security;
