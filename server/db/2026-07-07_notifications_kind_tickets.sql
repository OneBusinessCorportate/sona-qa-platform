-- Allow the sqa_notifications log to record the new daily Sona ticket-count
-- report ('tickets') and the already-existing auditor report ('auditor',
-- whose log rows were silently rejected by the old check). Purely additive:
-- existing rows and behaviour are unchanged.
alter table public.sqa_notifications drop constraint sqa_notifications_kind_check;
alter table public.sqa_notifications add constraint sqa_notifications_kind_check
  check (kind in ('daily', 'weekly', 'auditor', 'tickets'));
