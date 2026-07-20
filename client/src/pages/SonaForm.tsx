import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Company } from '../api';

// Report types, in priority order (НДС first, then налог с оборота).
const REPORT_TYPES = [
  { value: 'vat', label: 'НДС' },
  { value: 'turnover', label: 'Оборот' },
  { value: 'other', label: 'Другое' },
];

// Risk-based checking: higher risk is checked first.
const RISK_LEVELS = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
];

// 9-point Yes/No checklist (mirror of server/src/efficiency.ts).
// Оценка % = good answers / 9 * 100. `good` = the answer that scores a point.
export const CHECKLIST: Array<{ id: string; label: string; good: 'yes' | 'no' }> = [
  { id: 'overdue',    label: 'Есть просрочка',                     good: 'no'  },
  { id: 'signed',     label: 'Счета подписаны',                    good: 'yes' },
  { id: 'correct',    label: 'Корректность и полнота',             good: 'yes' },
  { id: 'confirmed',  label: 'Подтверждение цифр первичкой',       good: 'yes' },
  { id: 'format',     label: 'Формат и техническая сдача',         good: 'yes' },
  { id: 'errors',     label: 'Ошибки',                             good: 'no'  },
  { id: 'desk_audit', label: 'Камеральные требования / уточнения', good: 'no'  },
  { id: 'penalties',  label: 'Штрафы / уведомления',               good: 'no'  },
  { id: 'standards',  label: 'Внутренние стандарты',               good: 'yes' },
];
export type Checklist = Record<string, 'yes' | 'no'>;
export const defaultChecklist = (): Checklist => Object.fromEntries(CHECKLIST.map((c) => [c.id, c.good])) as Checklist;
export function checklistScore(c: Checklist): number {
  const good = CHECKLIST.reduce((n, item) => n + (c[item.id] === item.good ? 1 : 0), 0);
  return Math.round((good / CHECKLIST.length) * 10000) / 100;
}
const effBand = (v: number) => (v >= 90 ? 5 : v >= 75 ? 4 : v >= 60 ? 3 : v >= 40 ? 2 : 1);
// Баллы: Sona's 0–20 banding of the percentage (mirror of server/src/efficiency.ts scoreBand).
export const scoreBand = (pct: number) => (pct >= 95 ? 20 : pct >= 75 ? 15 : pct >= 60 ? 10 : pct >= 40 ? 5 : 0);

// Three review-stage comments mirrored on the server (scores.comments).
const COMMENT_FIELDS: Array<{ id: 'before' | 'work' | 'after'; label: string; placeholder: string }> = [
  { id: 'before', label: 'Комментарий до передачи бухгалтеру', placeholder: 'Что замечено до передачи бухгалтеру' },
  { id: 'work',   label: 'Комментарий по работе бухгалтера',   placeholder: 'Замечания по работе бухгалтера' },
  { id: 'after',  label: 'Комментарий после завершения',        placeholder: 'Итог после того, как бухгалтер завершил' },
];
type Comments = { before: string; work: string; after: string };
const emptyComments = (): Comments => ({ before: '', work: '', after: '' });

// Ticket decision — a single, deliberate choice instead of a small checkbox
// that is easy to miss. Sona must pick one before saving.
// - 'ticket_urgent': оценка не 100% → тикет бухгалтеру с тегом СРОЧНО
// - 'ticket':        оценка не 100% → тикет бухгалтеру
// - 'none':          оценка 100%   → тикет не создаётся
type TicketDecision = '' | 'ticket_urgent' | 'ticket' | 'none';
const TICKET_DECISIONS: Array<{ value: Exclude<TicketDecision, ''>; label: string }> = [
  { value: 'ticket_urgent', label: 'Оценка НЕ 100% → создать тикет у бухгалтера с тегом 🔴 СРОЧНО' },
  { value: 'ticket',        label: 'Оценка НЕ 100% → создать тикет у бухгалтера' },
  { value: 'none',          label: 'Оценка 100% → НЕ создавать тикет у бухгалтера' },
];

// Income/expense lines Sona logs per company (which amount, which section).
type FinLine = { kind: 'income' | 'expense'; section: string; amount: string; note: string };
const fmtAmount = (n: number) => n.toLocaleString('ru-RU');
const today = () => new Date().toISOString().slice(0, 10);

export function SonaForm({ presetCompany, onPresetConsumed, onReviewSaved }: { presetCompany?: string; onPresetConsumed?: () => void; onReviewSaved?: () => void } = {}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agrNo, setAgrNo] = useState('');
  const [accountant, setAccountant] = useState('');
  const [manager, setManager] = useState('');

  const [checkingDate, setCheckingDate] = useState(today());
  const [reportType, setReportType] = useState('vat');
  const [riskLevel, setRiskLevel] = useState('medium');
  const [period, setPeriod] = useState('');
  const [checklist, setChecklist] = useState<Checklist>(defaultChecklist);
  const [overdueDays, setOverdueDays] = useState('');
  const [financials, setFinancials] = useState<FinLine[]>([]);
  const [comments, setComments] = useState<Comments>(emptyComments);
  const [ticketDecision, setTicketDecision] = useState<TicketDecision>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // active=0 → include inactive clients too: Sona reviews closed/paused
    // contracts as well (e.g. B-3273, B-3660, 442), so hiding them lost data.
    // Active clients stay on top of the dropdown; inactive sink to the bottom.
    api<{ companies: Company[] }>('/companies?active=0')
      .then((r) => setCompanies(
        [...r.companies].sort((a, b) =>
          (a.status === 'Active' ? 0 : 1) - (b.status === 'Active' ? 0 : 1) ||
          (a.name_agr ?? '').localeCompare(b.name_agr ?? '')),
      ))
      .catch(() => {});
  }, []);

  // When another tab (e.g. «Компании») asks to check a specific company, jump
  // straight to it: preselect the company and clear any half-filled form.
  useEffect(() => {
    if (!presetCompany) return;
    setAgrNo(presetCompany);
    reset();
    setMsg(null);
    onPresetConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCompany]);

  const selected = useMemo(() => companies.find((c) => c.agr_no === agrNo), [companies, agrNo]);

  useEffect(() => {
    if (selected) {
      setAccountant(selected.accountant ?? '');
      setManager(selected.manager ?? '');
    }
  }, [selected]);

  // Оценка % — computed live from the 9-point checklist; Баллы — its 0–20 band.
  const score = checklistScore(checklist);
  const points = scoreBand(score);

  function setCheck(id: string, value: 'yes' | 'no') {
    setChecklist((c) => ({ ...c, [id]: value }));
  }

  // Income/expense line helpers.
  const finTotals = useMemo(() => financials.reduce(
    (t, f) => {
      const a = Number(f.amount) || 0;
      return f.kind === 'income' ? { ...t, income: t.income + a } : { ...t, expense: t.expense + a };
    },
    { income: 0, expense: 0 },
  ), [financials]);
  const addFin = (kind: 'income' | 'expense') =>
    setFinancials((f) => [...f, { kind, section: '', amount: '', note: '' }]);
  const updateFin = (i: number, patch: Partial<FinLine>) =>
    setFinancials((f) => f.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeFin = (i: number) => setFinancials((f) => f.filter((_, idx) => idx !== i));

  function reset() {
    setReportType('vat'); setRiskLevel('medium'); setPeriod('');
    setChecklist(defaultChecklist()); setOverdueDays(''); setFinancials([]); setComments(emptyComments());
    setTicketDecision('');
    // Keep checkingDate as-is so Sona can log several reviews for the same day.
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agrNo) { setMsg({ kind: 'err', text: 'Выберите компанию' }); return; }
    if (!period.trim()) { setMsg({ kind: 'err', text: 'Укажите отчётный период' }); return; }
    if (!ticketDecision) { setMsg({ kind: 'err', text: 'Выберите решение по тикету' }); return; }
    const isProblem = ticketDecision !== 'none';
    const urgent = ticketDecision === 'ticket_urgent';
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ review: any; ticket: any }>('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          company_agr_no: agrNo,
          accountant, manager,
          checking_date: checkingDate || undefined,
          report_type: reportType,
          risk_level: riskLevel,
          period: period.trim(),
          score_accountant: score,
          scores: {
            checklist,
            overdue_days: overdueDays ? Number(overdueDays) : null,
            score,
            points,
          },
          comments,
          financials: financials
            .filter((f) => f.amount !== '' && Number(f.amount))
            .map((f) => ({ kind: f.kind, section: f.section.trim(), amount: Number(f.amount) || 0, note: f.note.trim() || null })),
          record_type: isProblem ? 'problem' : 'other',
          ticket_priority: isProblem ? (urgent ? 'critical' : 'medium') : null,
          ticket_urgent: isProblem ? urgent : false,
        }),
      });
      setMsg({ kind: 'ok', text: res.ticket ? 'Сохранено. Создан тикет.' : 'Сохранено.' });
      reset();
      onReviewSaved?.();
    } catch (err) {
      setMsg({ kind: 'err', text: 'Ошибка: ' + (err instanceof Error ? err.message : 'unknown') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="card">
        <CompanySelect companies={companies} value={agrNo} onChange={setAgrNo} />
        {selected && (
          <p className="muted small" style={{ marginTop: 10 }}>
            Бухгалтер: <b>{accountant || '—'}</b> · Менеджер: {manager || '—'}
          </p>
        )}

        <div className="two-col" style={{ marginTop: 14 }}>
          <div>
            <label>Отчёт</label>
            <div className="type-pills">
              {REPORT_TYPES.map((t) => (
                <button type="button" key={t.value}
                  className={`type-pill ${reportType === t.value ? 'active t-other' : ''}`}
                  onClick={() => setReportType(t.value)}>{t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label>Риск</label>
            <div className="type-pills">
              {RISK_LEVELS.map((r) => (
                <button type="button" key={r.value}
                  className={`type-pill risk-${r.value} ${riskLevel === r.value ? 'active' : ''}`}
                  onClick={() => setRiskLevel(r.value)}>{r.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Чек-лист</h2>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <span className={`overall-badge band-${effBand(score)}`}>Оценка: {score}%</span>
            <span className={`overall-badge band-${effBand(score)}`}>Баллы: {points}</span>
          </span>
        </div>
        <label style={{ marginBottom: 14 }}>Дата проверки
          <input type="date" value={checkingDate} onChange={(e) => setCheckingDate(e.target.value)} />
        </label>
        <div className="checklist">
          {CHECKLIST.map((c) => (
            <div className="check-row" key={c.id}>
              <span className="rating-label">{c.label}</span>
              <div className="yn">
                <button type="button" className={`yn-btn ${checklist[c.id] === 'yes' ? (c.good === 'yes' ? 'good' : 'bad') : ''}`}
                  onClick={() => setCheck(c.id, 'yes')}>Да</button>
                <button type="button" className={`yn-btn ${checklist[c.id] === 'no' ? (c.good === 'no' ? 'good' : 'bad') : ''}`}
                  onClick={() => setCheck(c.id, 'no')}>Нет</button>
              </div>
            </div>
          ))}
          {checklist.overdue === 'yes' && (
            <div className="check-row">
              <span className="rating-label">Просрочка — дней</span>
              <input className="overdue-days" inputMode="numeric" placeholder="дней"
                value={overdueDays} onChange={(e) => setOverdueDays(e.target.value)} />
            </div>
          )}
        </div>
        <label style={{ marginTop: 14 }}>Отчётный период<span className="req"> *</span>
          <input placeholder="Апрель / 2-й кв." value={period}
            onChange={(e) => setPeriod(e.target.value)} required />
        </label>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Доходы и расходы</h2>
          <span className="muted small">Доход {fmtAmount(finTotals.income)} · Расход {fmtAmount(finTotals.expense)}</span>
        </div>
        {financials.length === 0 && <p className="muted small">Необязательно: укажите суммы и раздел по компании.</p>}
        {financials.map((f, i) => (
          <div className="fin-row" key={i}>
            <div className="type-pills">
              <button type="button" className={`type-pill fin-income ${f.kind === 'income' ? 'active' : ''}`}
                onClick={() => updateFin(i, { kind: 'income' })}>Доход</button>
              <button type="button" className={`type-pill fin-expense ${f.kind === 'expense' ? 'active' : ''}`}
                onClick={() => updateFin(i, { kind: 'expense' })}>Расход</button>
            </div>
            <input className="fin-section" placeholder="Раздел" value={f.section}
              onChange={(e) => updateFin(i, { section: e.target.value })} />
            <input className="fin-amount" inputMode="numeric" placeholder="Сумма" value={f.amount}
              onChange={(e) => updateFin(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} />
            <input className="fin-note" placeholder="Заметка" value={f.note}
              onChange={(e) => updateFin(i, { note: e.target.value })} />
            <button type="button" className="btn-icon" onClick={() => removeFin(i)}>✕</button>
          </div>
        ))}
        <div className="fin-add">
          <button type="button" className="btn-soft" onClick={() => addFin('income')}>+ Доход</button>
          <button type="button" className="btn-soft" onClick={() => addFin('expense')}>+ Расход</button>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Комментарии</h2>
          {selected && <span className="muted small">Бухгалтер: <b>{accountant || '—'}</b></span>}
        </div>
        {COMMENT_FIELDS.map((f) => (
          <label key={f.id} style={{ marginTop: f.id === 'before' ? 0 : 12, display: 'block' }}>
            {f.label}
            <textarea value={comments[f.id]} rows={2} placeholder={f.placeholder}
              onChange={(e) => setComments((c) => ({ ...c, [f.id]: e.target.value }))} />
          </label>
        ))}
        <label style={{ marginTop: 16, display: 'block' }}>
          Решение по тикету<span className="req"> *</span>
          <select
            className={`ticket-decision${ticketDecision === '' ? ' unset' : ''}`}
            value={ticketDecision}
            onChange={(e) => setTicketDecision(e.target.value as TicketDecision)}
            required
          >
            <option value="" disabled>— выберите решение —</option>
            {TICKET_DECISIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="submit-bar">
        {msg && <div className={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</div>}
        <button disabled={busy} type="submit" className="btn-primary-lg">{busy ? 'Сохранение…' : 'Сохранить'}</button>
      </div>
    </form>
  );
}

export function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = companies.find((c) => c.agr_no === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  // Show the full company list (the dropdown scrolls); search narrows it.
  const filtered = q
    ? companies.filter((c) =>
        (c.name_agr ?? '').toLowerCase().includes(q) ||
        (c.name_tax ?? '').toLowerCase().includes(q) ||
        c.agr_no.toLowerCase().includes(q) ||
        (c.accountant ?? '').toLowerCase().includes(q))
    : companies;

  return (
    <div className="combobox" ref={ref}>
      <label>Компания</label>
      <button type="button" className="combo-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? `${selected.name_agr ?? selected.name_tax ?? selected.agr_no} (№${selected.agr_no})` : 'Выберите компанию…'}
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="combo-pop">
          <input autoFocus placeholder="Поиск по названию, №, бухгалтеру…" value={query}
            onChange={(e) => setQuery(e.target.value)} />
          <div className="combo-list">
            {filtered.map((c) => (
              <button type="button" key={c.agr_no} className={`combo-item ${c.agr_no === value ? 'sel' : ''}`}
                onClick={() => { onChange(c.agr_no); setOpen(false); setQuery(''); }}>
                <span>{c.name_agr ?? c.name_tax ?? c.agr_no}</span>
                <span className="combo-meta">
                  №{c.agr_no}{c.accountant ? ` · ${c.accountant}` : ''}
                  {c.status !== 'Active' ? ' · неактивен' : ''}
                </span>
              </button>
            ))}
            {filtered.length === 0 && <div className="muted small combo-empty">Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}
