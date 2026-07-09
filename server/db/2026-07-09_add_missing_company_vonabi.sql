-- Add a company that existed in Sona's old working file but was missing from the
-- platform's shared company reference (public.mqa_chats).
--
-- Source: Sona's previous Excel ("Лист1" → column «Клиент»). 88 unique clients
-- were compared against mqa_chats using normalised matching (upper-case, strip
-- spaces/punctuation/quotes, drop legal-form suffixes ԱՁ/ԱՋ/ՍՊԸ, match against
-- both name_agr and name_tax). 86 of 88 already existed. Only ВОНАБИ was truly
-- absent and is added here.
--
-- NOTE on the second unmatched name — ՆԱՐԵԿ ԳԱԲՐԻԼՅԱՆ ԱՁ: it is NOT missing.
-- It already exists as agr_no B-4504 ("NAREK GABRIELIAN" / «ՆԱՐԵԿ ԳԱԲՐԻԵԼՅԱՆ ԱՁ»,
-- accountant Լիլիթ… -> Հասմիկ) but with status = 'Inactive' and a one-letter
-- spelling variant (Gabri**e**lyan vs Gabrilyan). Left untouched on purpose —
-- flagged for Sona's manual review rather than auto-reactivated.
--
-- agr_no: 'SQA-VONABI' is a placeholder identifier (the real contract № / ХВХХ
-- was not in the file). Update agr_no/hvhh here once the real code is known.
-- Idempotent: re-running is a no-op if the company already exists (by id or by
-- normalised name).

insert into public.mqa_chats (agr_no, name_agr, name_tax, chat_name, accountant, status)
select 'SQA-VONABI', 'VONABI LLC', 'ՎՈՆԱԲԻ ՍՊԸ', 'ՎՈՆԱԲԻ ՍՊԸ', 'Լիլիթ', 'Active'
where not exists (
  select 1 from public.mqa_chats
  where agr_no = 'SQA-VONABI'
     or regexp_replace(upper(coalesce(name_tax,'')), '[^[:alnum:]]','','g') = 'ՎՈՆԱԲԻՍՊԸ'
     or regexp_replace(upper(coalesce(name_agr,'')), '[^[:alnum:]]','','g') = 'VONABILLC'
);
