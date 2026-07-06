import { Fragment, useEffect, useState } from 'react';
import { api, type Company } from '../api';
import { CompanySelect } from './SonaForm';

const REPORT_LABEL: Record<string, string> = { vat: 'НДС', turnover: 'Оборот', other: 'Другое' };

interface ReviewRow {
  id: string; company_agr_no: string; accountant: string | null; report_type: string | null;
  efficiency_pct: number | null; record_type: string | null; period: string | null; comment: string | null;
  checking_date: string | null; risk_level: string | null;
}

const REPORT_TYPES = [
  { value: 'vat', label: 'НДС' },
  { value: 'turnover', label: 'Оборот' },
  { value: 'other', label: 'Другое' },
];

const RISK_LEVELS = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
];

interface CompanyFinance {
  agr_no: string; name: string; accountant: string | null; income: number; expense: number;
  lines: Array<{ kind: 'income' | 'expense'; section: string; amount: number; note: string | null }>;
}
interface Daily {
  date: string;
  totals: { reviews: number; companies: number; problems: number; praises: number; avgEfficiency: number | null };
  byAccountant: Array<{ accountant: string; reviews: number; avg_efficiency: number | null; problems: number }>;
  finance: { income: number; expense: number };
  financeByCompany: CompanyFinance[];
  openTickets: number; urgentTickets: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`);
const money = (v: number) => v.toLocaleString('ru-RU');

export function SonaReport() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [daily, setDaily] = useState<Daily | null>(null);
  const [sendMsg, setSendMsg] = useState('');

  async function load() {
    setDaily(await api<Daily>(`/reports/daily?date=${from}&to=${to}`));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  async function send(kind: 'daily' | 'auditor') {
    setSendMsg('Отправка…');
    try {
      const r = await api<{ ok: boolean; skipped?: boolean; error?: string }>('/reports/send', {
        method: 'POST', body: JSON.stringify({ kind, date: from, to }),
      });
      setSendMsg(r.ok ? '✓ Отправлено в Telegram' : r.skipped ? 'Telegram не настроен' : 'Ошибка: ' + r.error);
    } catch (e) {
      setSendMsg('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'));
    }
  }

  return (
    <div className="report">
      <AuditorSection from={from} to={to} onFrom={setFrom} onTo={setTo} onSend={() => send('auditor')} />

      <div className="card">
        <div className="report-head">
          <h2>Сводка</h2>
          <label className="small">с <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="small">по <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button onClick={() => send('daily')}>Отправить в Telegram</button>
        </div>
        {daily && (
          <>
            <div className="metrics">
              <Metric label="Проверок" value={daily.totals.reviews} />
              <Metric label="Компаний" value={daily.totals.companies} />
              <Metric label="Ср. оценка" value={pct(daily.totals.avgEfficiency)} />
              <Metric label="Проблем" value={daily.totals.problems} />
              <Metric label="Тикетов" value={daily.openTickets} />
              <Metric label="🔴 Срочных" value={daily.urgentTickets} />
            </div>
            <table>
              <thead><tr><th>Бухгалтер</th><th>Проверок</th><th>Ср. оценка</th><th>Проблем</th></tr></thead>
              <tbody>
                {daily.byAccountant.map((a) => (
                  <tr key={a.accountant}><td>{a.accountant}</td><td>{a.reviews}</td><td>{pct(a.avg_efficiency)}</td><td>{a.problems}</td></tr>
                ))}
                {daily.byAccountant.length === 0 && <tr><td colSpan={4} className="muted">Нет данных за период</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>

      {daily && (daily.financeByCompany.length > 0 || daily.finance.income > 0 || daily.finance.expense > 0) && (
        <div className="card">
          <div className="report-head">
            <h2>Доходы и расходы по компаниям</h2>
          </div>
          <div className="metrics">
            <Metric label="Доход" value={money(daily.finance.income)} />
            <Metric label="Расход" value={money(daily.finance.expense)} />
            <Metric label="Сальдо" value={money(daily.finance.income - daily.finance.expense)} />
          </div>
          <table>
            <thead><tr><th>Компания</th><th>Бухгалтер</th><th>Раздел</th><th>Доход</th><th>Расход</th></tr></thead>
            <tbody>
              {daily.financeByCompany.flatMap((c) =>
                c.lines.map((l, i) => (
                  <tr key={c.agr_no + i}>
                    <td>{i === 0 ? c.name : ''}</td>
                    <td>{i === 0 ? (c.accountant ?? '—') : ''}</td>
                    <td>{l.section}{l.note ? <span className="muted small"> · {l.note}</span> : null}</td>
                    <td>{l.kind === 'income' ? money(l.amount) : ''}</td>
                    <td>{l.kind === 'expense' ? money(l.amount) : ''}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      <ReviewsToday />

      {sendMsg && <div className={sendMsg.startsWith('✓') ? 'success' : 'muted'}>{sendMsg}</div>}
    </div>
  );
}

type EditData = {
  company_agr_no: string;
  checking_date: string;
  period: string;
  report_type: string;
  risk_level: string;
  record_type: string;
  comment: string;
};

// Список проверок за период с возможностью удалить или полностью редактировать запись.
function ReviewsToday() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({
    company_agr_no: '', checking_date: '', period: '',
    report_type: 'vat', risk_level: 'medium', record_type: 'other', comment: '',
  });
  const [editBusy, setEditBusy] = useState(false);

  async function load() {
    const r = await api<{ reviews: ReviewRow[] }>(`/reviews?from=${from}&to=${to}`);
    setRows(r.reviews);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);
  useEffect(() => {
    // Include inactive clients so their names resolve in the review list too.
    api<{ companies: Company[] }>('/companies?active=0').then((r) => setCompanies(r.companies)).catch(() => {});
  }, []);

  const names: Record<string, string> = Object.fromEntries(
    companies.map((c) => [c.agr_no, c.name_agr ?? c.name_tax ?? c.agr_no])
  );

  async function remove(id: string) {
    if (!confirm('Удалить проверку? Связанный тикет также будет удалён.')) return;
    await api(`/reviews/${id}`, { method: 'DELETE' });
    load();
  }

  function startEdit(r: ReviewRow) {
    setEditId(r.id);
    setEditData({
      company_agr_no: r.company_agr_no,
      checking_date: r.checking_date ?? '',
      period: r.period ?? '',
      report_type: r.report_type ?? 'vat',
      risk_level: r.risk_level ?? 'medium',
      record_type: r.record_type ?? 'other',
      comment: r.comment ?? '',
    });
  }

  async function saveEdit(id: string) {
    setEditBusy(true);
    try {
      await api(`/reviews/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
      setEditId(null);
      load();
    } finally {
      setEditBusy(false);
    }
  }

  function set(field: keyof EditData, value: string) {
    setEditData((d) => ({ ...d, [field]: value }));
  }

  return (
    <div className="card">
      <div className="report-head">
        <h2>{from === to ? 'Проверки за день' : 'Проверки за период'}</h2>
        <label className="small">с <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="small">по <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <table>
        <thead><tr><th>Компания</th><th>Бухгалтер</th><th>Отчёт</th><th>Оценка</th><th></th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <Fragment key={r.id}>
              <tr>
                <td>{names[r.company_agr_no] ?? r.company_agr_no}</td>
                <td>{r.accountant ?? '—'}</td>
                <td>{r.report_type ? (REPORT_LABEL[r.report_type] ?? r.report_type) : '—'}</td>
                <td>{pct(r.efficiency_pct)}</td>
                <td>{r.record_type === 'problem' ? <span className="pill p-high">проблема</span> : ''}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-icon" title="Редактировать"
                    onClick={() => editId === r.id ? setEditId(null) : startEdit(r)}>✎</button>
                  <button type="button" className="btn-icon" title="Удалить" onClick={() => remove(r.id)}>✕</button>
                </td>
              </tr>
              {editId === r.id && (
                <tr>
                  <td colSpan={6} style={{ padding: '12px 14px', background: 'var(--surface2, #f8f9fa)' }}>
                    <div style={{ marginBottom: 10 }}>
                      <CompanySelect companies={companies} value={editData.company_agr_no}
                        onChange={(v) => set('company_agr_no', v)} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                      <label style={{ flex: '0 0 160px' }}>
                        Дата проверки
                        <input type="date" value={editData.checking_date}
                          onChange={(e) => set('checking_date', e.target.value)} />
                      </label>
                      <label style={{ flex: '1 1 130px' }}>
                        Отчётный период
                        <input placeholder="Апрель / 2-й кв." value={editData.period}
                          onChange={(e) => set('period', e.target.value)} />
                      </label>
                      <label style={{ flex: '0 0 110px' }}>
                        Тип отчёта
                        <select value={editData.report_type} onChange={(e) => set('report_type', e.target.value)}>
                          {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </label>
                      <label style={{ flex: '0 0 110px' }}>
                        Риск
                        <select value={editData.risk_level} onChange={(e) => set('risk_level', e.target.value)}>
                          {RISK_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                        </select>
                      </label>
                      <label style={{ flex: '0 0 110px' }}>
                        Запись
                        <select value={editData.record_type} onChange={(e) => set('record_type', e.target.value)}>
                          <option value="other">Обычная</option>
                          <option value="problem">Проблема</option>
                        </select>
                      </label>
                    </div>
                    <label style={{ display: 'block', marginBottom: 10 }}>
                      Комментарий
                      <textarea rows={2} value={editData.comment}
                        onChange={(e) => set('comment', e.target.value)} />
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn-soft" disabled={editBusy} onClick={() => saveEdit(r.id)}>
                        {editBusy ? 'Сохранение…' : 'Сохранить'}
                      </button>
                      <button type="button" className="btn-soft" onClick={() => setEditId(null)}>Отмена</button>
                    </div>
                  </td>
                </tr>
              )}
              {editId !== r.id && r.comment && (
                <tr className="review-comment-row">
                  <td colSpan={6} className="muted small">{r.comment}</td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">Проверок за период нет</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="metric"><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>;
}

interface Auditor {
  date: string;
  planDate: string;
  reports: Array<{ accountant: string; checked: number; total: number; avgScore: number | null }>;
  plan: Array<{ accountant: string; planned_reports: number; note: string | null }>;
}
interface PlanRow { accountant: string; planned_reports: number; note: string }

// Отчёт аудитора: проверено/всего по бухгалтерам за период + план на следующий день.
function AuditorSection({ from, to, onFrom, onTo, onSend }: {
  from: string; to: string; onFrom: (d: string) => void; onTo: (d: string) => void; onSend: () => void;
}) {
  const [data, setData] = useState<Auditor | null>(null);
  const [accountants, setAccountants] = useState<string[]>([]);
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [saved, setSaved] = useState('');

  async function load() {
    const a = await api<Auditor>(`/reports/auditor?date=${from}&to=${to}`);
    setData(a);
    setTotals(Object.fromEntries(a.reports.map((r) => [r.accountant, String(r.total || '')])));
    setPlan(a.plan.length ? a.plan.map((p) => ({ accountant: p.accountant, planned_reports: p.planned_reports, note: p.note ?? '' })) : []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);
  useEffect(() => {
    api<{ accountants: Array<{ name: string }> }>('/companies/meta/accountants')
      .then((r) => setAccountants(r.accountants.map((x) => x.name))).catch(() => {});
  }, []);

  async function saveTotal(accountant: string) {
    await api('/reports/workload', { method: 'PUT', body: JSON.stringify({ accountant, total_reports: Number(totals[accountant]) || 0 }) });
    setSaved('✓ Сохранено');
  }
  async function savePlan() {
    await api('/reports/plan', { method: 'PUT', body: JSON.stringify({ date: data?.planDate, items: plan }) });
    setSaved('✓ План сохранён');
    load();
  }
  function addPlanRow() { setPlan((p) => [...p, { accountant: accountants[0] ?? '', planned_reports: 10, note: '' }]); }
  function updatePlan(i: number, patch: Partial<PlanRow>) { setPlan((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r))); }
  function removePlan(i: number) { setPlan((p) => p.filter((_, idx) => idx !== i)); }

  return (
    <div className="card">
      <div className="report-head">
        <h2>📑 Отчёт аудитора</h2>
        <label className="small">с <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} /></label>
        <label className="small">по <input type="date" value={to} onChange={(e) => onTo(e.target.value)} /></label>
        <button onClick={onSend}>Отправить в Telegram</button>
      </div>

      <table>
        <thead><tr><th>Бухгалтер</th><th>Проверено</th><th>Всего</th><th>Ср. оценка</th></tr></thead>
        <tbody>
          {(data?.reports ?? []).map((r) => (
            <tr key={r.accountant}>
              <td>{r.accountant}</td>
              <td><b>{r.checked}</b></td>
              <td>
                <input className="total-input" inputMode="numeric" value={totals[r.accountant] ?? ''}
                  onChange={(e) => setTotals((t) => ({ ...t, [r.accountant]: e.target.value }))}
                  onBlur={() => saveTotal(r.accountant)} />
              </td>
              <td>{pct(r.avgScore)}</td>
            </tr>
          ))}
          {(!data || data.reports.length === 0) && <tr><td colSpan={4} className="muted">Нет проверок за период</td></tr>}
        </tbody>
      </table>

      <div className="card-title" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}>План на завтра{data ? ` — ${data.planDate}` : ''}</h3>
        <button type="button" className="btn-soft" onClick={addPlanRow}>+ Бухгалтер</button>
      </div>
      {plan.length === 0 && <p className="muted small">План не задан.</p>}
      {plan.map((r, i) => (
        <div className="plan-row" key={i}>
          <select value={r.accountant} onChange={(e) => updatePlan(i, { accountant: e.target.value })}>
            {!accountants.includes(r.accountant) && r.accountant && <option value={r.accountant}>{r.accountant}</option>}
            {accountants.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input className="plan-count" inputMode="numeric" placeholder="отчётов" value={r.planned_reports}
            onChange={(e) => updatePlan(i, { planned_reports: Number(e.target.value) || 0 })} />
          <input placeholder="Заметка (необязательно)" value={r.note} onChange={(e) => updatePlan(i, { note: e.target.value })} />
          <button type="button" className="btn-icon" onClick={() => removePlan(i)}>✕</button>
        </div>
      ))}
      {plan.length > 0 && <button className="btn-soft" style={{ marginTop: 10 }} onClick={savePlan}>Сохранить план</button>}
      {saved && <div className="success" style={{ marginTop: 10 }}>{saved}</div>}
    </div>
  );
}
