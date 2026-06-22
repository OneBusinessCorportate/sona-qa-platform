-- Seed for sqa_criteria — the weighted quality-scorecard criteria (К1–К5).
--
-- Taken from Sona's "Гайд" sheet (ОЦЕНКА КАЧЕСТВА РАБОТЫ БУХГАЛТЕРА):
--   К1 ошибки/уровень   вес 0.1   К2 сроки      вес 0.3   К3 качество отч.  вес 0.2
--   К4 полнота докум.   вес 0.3   К5 доработки  вес 0.1
-- Weights are stored as integer percent (10/30/20/30/10) so they sum to 100;
-- the runtime weights live in server/src/efficiency.ts (SCORECARD_CRITERIA).
--
-- Idempotent: safe to re-run. Apply with the Supabase SQL editor or psql.
insert into sqa_criteria (id, name, target, weight, scale_max, sort, descriptions, active) values
  ('k1','Количество и уровень ошибок',        'accountant',10,5,1,'{"1":"критические ошибки/штрафы","3":"единичные некритические","5":"ошибок не выявлено"}'::jsonb,true),
  ('k2','Соблюдение сроков выполнения задач',  'accountant',30,5,2,'{"1":"систематические просрочки","3":"единичные задержки","5":"все сроки соблюдены"}'::jsonb,true),
  ('k3','Качество подготовки отчётности',      'accountant',20,5,3,'{"1":"существенные замечания","3":"мелкие замечания","5":"отчётность без замечаний"}'::jsonb,true),
  ('k4','Полнота и корректность документов',   'accountant',30,5,4,'{"1":"регулярные недостатки","3":"единичные недостатки","5":"документы полные и корректные"}'::jsonb,true),
  ('k5','Количество доработок после проверки', 'accountant',10,5,5,'{"1":"более 3 доработок","3":"1–2 доработки","5":"доработок не требовалось"}'::jsonb,true)
on conflict (id) do update set
  name = excluded.name,
  target = excluded.target,
  weight = excluded.weight,
  scale_max = excluded.scale_max,
  sort = excluded.sort,
  descriptions = excluded.descriptions,
  active = true;
