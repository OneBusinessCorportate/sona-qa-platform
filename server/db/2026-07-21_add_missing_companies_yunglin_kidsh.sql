-- Add two clients that Sona has but that were missing from the platform's shared
-- company reference (public.mqa_chats): B-4836 «YUNGLIN WANG LLC» and
-- B-4827 «KIDSH LLC». Without a row in mqa_chats they never appear in the
-- «Проверка» company dropdown, so Sona could not check them.
--
-- Source: Sona's client export (agr_no, ENG name, ХВХХ/tax no., name in Armenian,
-- accountant, Telegram chat title). Only the fields the platform actually reads
-- are populated; unknown columns are left null.
--
-- Both are inserted as Active so they show up in the (active-only) dropdown.
-- Idempotent: each insert is a no-op if the company already exists, matched by
-- agr_no OR by a normalised (upper-cased, punctuation-stripped) name so a
-- pre-existing spelling variant is not duplicated. Safe to re-run.

-- B-4836 — YUNGLIN WANG LLC / ՎԱՆԳ ՅՈՒՆԼԻՆ (ХВХХ 20249358), accountant Օլյա.
insert into public.mqa_chats (agr_no, name_agr, name_tax, chat_name, chat_link, hvhh, accountant, status)
select 'B-4836', 'YUNGLIN WANG LLC', 'ՎԱՆԳ ՅՈՒՆԼԻՆ', 'B-4836 <Յունլին Վանգ> ԱՁ ENG',
       'https://web.telegram.org/a/#-5599732193', '20249358', 'Օլյա', 'Active'
where not exists (
  select 1 from public.mqa_chats
  where agr_no = 'B-4836'
     or regexp_replace(upper(coalesce(name_agr,'')), '[^[:alnum:]]','','g') = 'YUNGLINWANGLLC'
     or regexp_replace(upper(coalesce(name_tax,'')), '[^[:alnum:]]','','g') = 'ՎԱՆԳՅՈՒՆԼԻՆ'
);

-- B-4827 — KIDSH LLC (no tax no./accountant provided in the source).
insert into public.mqa_chats (agr_no, name_agr, chat_name, chat_link, status)
select 'B-4827', 'KIDSH LLC', 'B-4827 <Քիդշ> ՍՊԸ ENG', 'https://web.telegram.org/a/#-5324248163', 'Active'
where not exists (
  select 1 from public.mqa_chats
  where agr_no = 'B-4827'
     or regexp_replace(upper(coalesce(name_agr,'')), '[^[:alnum:]]','','g') = 'KIDSHLLC'
);
