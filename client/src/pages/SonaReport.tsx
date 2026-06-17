import { useEffect, useState } from 'react';
import { api } from '../api';

interface Daily {
  date: string;
  totals: { reviews: number; companies: number; problems: number; praises: number; avgEfficiency: number | null };
  byAccountant: Array<{ accountant: string; reviews: number; avg_efficiency: number | null; problems: number }>;
  openTickets: number; urgentTickets: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`);

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

      {sendMsg && <div className={sendMsg.startsWith('✓') ? 'success' : 'muted'}>{sendMsg}</div>}
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
