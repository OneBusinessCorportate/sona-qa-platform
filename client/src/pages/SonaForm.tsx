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
const CHECKLIST: Array<{ id: string; label: string; good: 'yes' | 'no' }> = [
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
type Checklist = Record<string, 'yes' | 'no'>;
const defaultChecklist = (): Checklist => Object.fromEntries(CHECKLIST.map((c) => [c.id, c.good])) as Checklist;
function checklistScore(c: Checklist): number {
  const good = CHECKLIST.reduce((n, item) => n + (c[item.id] === item.good ? 1 : 0), 0);
  return Math.round((good / CHECKLIST.length) * 10000) / 100;
}
const effBand = (v: number) => (v >= 90 ? 5 : v >= 75 ? 4 : v >= 60 ? 3 : v >= 40 ? 2 : 1);

export function SonaForm() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agrNo, setAgrNo] = useState('');
  const [accountant, setAccountant] = useState('');
  const [manager, setManager] = useState('');

  const [reportType, setReportType] = useState('vat');
  const [riskLevel, setRiskLevel] = useState('medium');
  const [period, setPeriod] = useState('');
  const [checklist, setChecklist] = useState<Checklist>(defaultChecklist);
  const [overdueDays, setOverdueDays] = useState('');
  const [comment, setComment] = useState('');
  const [isProblem, setIsProblem] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ companies: Company[] }>('/companies').then((r) => setCompanies(r.companies)).catch(() => {});
  }, []);

  const selected = useMemo(() => companies.find((c) => c.agr_no === agrNo), [companies, agrNo]);

  useEffect(() => {
    if (selected) {
      setAccountant(selected.accountant ?? '');
      setManager(selected.manager ?? '');
    }
  }, [selected]);

  // Оценка % — computed live from the 9-point checklist.
  const score = checklistScore(checklist);

  function setCheck(id: string, value: 'yes' | 'no') {
    setChecklist((c) => ({ ...c, [id]: value }));
  }

  function reset() {
    setReportType('vat'); setRiskLevel('medium'); setPeriod('');
    setChecklist(defaultChecklist()); setOverdueDays(''); setComment('');
    setIsProblem(false); setUrgent(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agrNo) { setMsg({ kind: 'err', text: 'Выберите компанию' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ review: any; ticket: any }>('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          company_agr_no: agrNo,
          accountant, manager,
          report_type: reportType,
          risk_level: riskLevel,
          period: period || null,
          score_accountant: score,
          scores: {
            checklist,
            overdue_days: overdueDays ? Number(overdueDays) : null,
            score,
          },
          record_type: isProblem ? 'problem' : 'other',
          comment: comment || null,
          ticket_priority: isProblem ? (urgent ? 'critical' : 'medium') : null,
          ticket_urgent: isProblem ? urgent : false,
        }),
      });
      setMsg({ kind: 'ok', text: res.ticket ? 'Сохранено. Создан тикет.' : 'Сохранено.' });
      reset();
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
        <label style={{ marginTop: 12 }}>Период (необязательно)
          <input placeholder="напр. 05.2026 / 2-й кв." value={period} onChange={(e) => setPeriod(e.target.value)} />
        </label>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Чек-лист</h2>
          <span className={`overall-badge band-${effBand(score)}`}>Оценка: {score}%</span>
        </div>
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
      </div>

      <div className="card">
        <label>Комментарий (необязательно)
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Что не так / что отметить" />
        </label>
        <label className="urgent-toggle" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={isProblem} onChange={(e) => setIsProblem(e.target.checked)} />
          <span>Проблема — создать тикет</span>
        </label>
        {isProblem && (
          <label className="urgent-toggle" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            <span>🔴 Срочно</span>
          </label>
        )}
      </div>

      <div className="submit-bar">
        {msg && <div className={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</div>}
        <button disabled={busy} type="submit" className="btn-primary-lg">{busy ? 'Сохранение…' : 'Сохранить'}</button>
      </div>
    </form>
  );
}

function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: string; onChange: (v: string) => void }) {
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
  const filtered = (q
    ? companies.filter((c) =>
        (c.name_agr ?? '').toLowerCase().includes(q) ||
        (c.name_tax ?? '').toLowerCase().includes(q) ||
        c.agr_no.includes(q) ||
        (c.accountant ?? '').toLowerCase().includes(q))
    : companies
  ).slice(0, 60);

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
                <span className="combo-meta">№{c.agr_no}{c.accountant ? ` · ${c.accountant}` : ''}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="muted small combo-empty">Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}
