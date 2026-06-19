import { Fragment, useEffect, useState } from 'react';
import { api, type Company } from '../api';

const REPORT_LABEL: Record<string, string> = { vat: 'НДС', turnover: 'Оборот', other: 'Другое' };

interface ReviewRow {
  id: string; company_agr_no: string; accountant: string | null; report_type: string | null;
  efficiency_pct: number | null; record_type: string | null; period: string | null; comment: string | null;
}

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
  const [date, setDate] = useState(today());
  const [daily, setDaily] = useState<Daily | null>(null);
  const [sendMsg, setSendMsg] = useState('');

  async function load() {
    setDaily(await api<Daily>(`/reports/daily?date=${date}`));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  async function send(kind: 'daily' | 'auditor') {
    setSendMsg('Отправка…');
    try {
      const r = await api<{ ok: boolean; skipped?: boolean; error?: string }>('/reports/send', {
        method: 'POST', body: JSON.stringify({ kind, date }),
      });
      setSendMsg(r.ok ? '✓ Отправлено в Telegram' : r.skipped ? 'Telegram не настроен' : 'Ошибка: ' + r.error);
    } catch (e) {
      setSendMsg('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'));
    }
  }

  return (
    <div className="report">
      <AuditorSection date={date} onDate={setDate} onSend={() => send('auditor')} />

      <div className="card">
        <div className="report-head">
          <h2>Сводка за день</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                {daily.byAccountant.length === 0 && <tr><td colSpan={4} className="muted">Нет данных за день</td></tr>}
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

      <ReviewsToday date={date} />

      {sendMsg && <div className={sendMsg.startsWith('✓') ? 'success' : 'muted'}>{sendMsg}</div>}
    </div>
  );
}

// Список проверок за день с возможностью удалить ошибочную запись.
function ReviewsToday({ date }: { date: string }) {
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  async function load() {
    const r = await api<{ reviews: ReviewRow[] }>(`/reviews?date=${date}`);
    setRows(r.reviews);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);
  useEffect(() => {
    api<{ companies: Company[] }>('/companies')
      .then((r) => setNames(Object.fromEntries(r.companies.map((c) => [c.agr_no, c.name_agr ?? c.name_tax ?? c.agr_no]))))
      .catch(() => {});
  }, []);

  async function remove(id: string) {
    if (!confirm('Удалить проверку? Связанный тикет также будет удалён.')) return;
    await api(`/reviews/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="card">
      <div className="report-head"><h2>Проверки за день</h2></div>
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
                <td><button type="button" className="btn-icon" title="Удалить" onClick={() => remove(r.id)}>✕</button></td>
              </tr>
              {r.comment && (
                <tr className="review-comment-row">
                  <td colSpan={6} className="muted small">{r.comment}</td>
                </tr>
              )}
            </Fragment>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">Проверок за день нет</td></tr>}
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

// Дневной отчёт аудитора: проверено/всего по бухгалтерам + план на завтра.
function AuditorSection({ date, onDate, onSend }: { date: string; onDate: (d: string) => void; onSend: () => void }) {
  const [data, setData] = useState<Auditor | null>(null);
  const [accountants, setAccountants] = useState<string[]>([]);
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [saved, setSaved] = useState('');

  async function load() {
    const a = await api<Auditor>(`/reports/auditor?date=${date}`);
    setData(a);
    setTotals(Object.fromEntries(a.reports.map((r) => [r.accountant, String(r.total || '')])));
    setPlan(a.plan.length ? a.plan.map((p) => ({ accountant: p.accountant, planned_reports: p.planned_reports, note: p.note ?? '' })) : []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);
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
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} />
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
          {(!data || data.reports.length === 0) && <tr><td colSpan={4} className="muted">Нет проверок за день</td></tr>}
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
