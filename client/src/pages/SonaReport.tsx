import { useEffect, useState } from 'react';
import { api } from '../api';

interface Daily {
  date: string;
  totals: { reviews: number; companies: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null; avgEfficiency: number | null };
  byAccountant: Array<{ accountant: string; reviews: number; avg_score: number | null; avg_efficiency: number | null; problems: number }>;
  finance: { income: number; expense: number };
  openTickets: number; urgentTickets: number;
}
interface Weekly {
  weekStart: string;
  totals: { reviews: number; companies: number; accountants: number; problems: number; praises: number; avgAccountant: number | null; avgClient: number | null; avgEfficiency: number | null };
  efficiency: { totalReviews: number; activeDays: number; avgPerDay: number | null };
}

const today = () => new Date().toISOString().slice(0, 10);
const num = (v: number | null) => (v === null || v === undefined ? '—' : v);
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`);
const money = (v: number) => (v ?? 0).toLocaleString('ru-RU');

export function SonaReport() {
  const [date, setDate] = useState(today());
  const [daily, setDaily] = useState<Daily | null>(null);
  const [weekly, setWeekly] = useState<Weekly | null>(null);
  const [sendMsg, setSendMsg] = useState('');

  async function load() {
    setDaily(await api<Daily>(`/reports/daily?date=${date}`));
    setWeekly(await api<Weekly>('/reports/weekly'));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  async function send(kind: 'daily' | 'weekly') {
    setSendMsg('Отправка…');
    try {
      const r = await api<{ ok: boolean; skipped?: boolean; error?: string }>('/reports/send', {
        method: 'POST', body: JSON.stringify({ kind, date }),
      });
      setSendMsg(r.ok ? '✓ Отправлено в Telegram' : r.skipped ? 'Telegram не настроен (см. env)' : 'Ошибка: ' + r.error);
    } catch (e) {
      setSendMsg('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'));
    }
  }

  return (
    <div className="report">
      <div className="card">
        <div className="report-head">
          <h2>Дневной отчёт</h2>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={() => send('daily')}>Отправить в Telegram</button>
        </div>
        {daily && (
          <>
            <div className="metrics">
              <Metric label="Проверок" value={daily.totals.reviews} />
              <Metric label="Компаний" value={daily.totals.companies} />
              <Metric label="⚙️ Эффективность" value={pct(daily.totals.avgEfficiency)} />
              <Metric label="Проблем" value={daily.totals.problems} />
              <Metric label="💰 Доходы" value={money(daily.finance.income)} />
              <Metric label="💸 Расходы" value={money(daily.finance.expense)} />
              <Metric label="Ср. бухгалтер" value={num(daily.totals.avgAccountant)} />
              <Metric label="Ср. клиент" value={num(daily.totals.avgClient)} />
              <Metric label="Откр. тикетов" value={daily.openTickets} />
              <Metric label="🔴 Срочных" value={daily.urgentTickets} />
            </div>
            <h3>По бухгалтерам</h3>
            <table>
              <thead><tr><th>Бухгалтер</th><th>Проверок</th><th>Ср. оценка</th><th>Эффективность</th><th>Проблем</th></tr></thead>
              <tbody>
                {daily.byAccountant.map((a) => (
                  <tr key={a.accountant}><td>{a.accountant}</td><td>{a.reviews}</td><td>{num(a.avg_score)}</td><td>{pct(a.avg_efficiency)}</td><td>{a.problems}</td></tr>
                ))}
                {daily.byAccountant.length === 0 && <tr><td colSpan={5} className="muted">Нет данных за день</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="card">
        <div className="report-head">
          <h2>Недельный отчёт + эффективность Соны</h2>
          <button onClick={() => send('weekly')}>Отправить в Telegram</button>
        </div>
        {weekly && (
          <div className="metrics">
            <Metric label="Проверок" value={weekly.totals.reviews} />
            <Metric label="Компаний" value={weekly.totals.companies} />
            <Metric label="Бухгалтеров" value={weekly.totals.accountants} />
            <Metric label="⚙️ Эффективность" value={pct(weekly.totals.avgEfficiency)} />
            <Metric label="Проблем" value={weekly.totals.problems} />
            <Metric label="Ср. бухгалтер" value={num(weekly.totals.avgAccountant)} />
            <Metric label="Эфф.: проверок" value={weekly.efficiency.totalReviews} />
            <Metric label="Активных дней" value={weekly.efficiency.activeDays} />
            <Metric label="≈ в день" value={num(weekly.efficiency.avgPerDay)} />
          </div>
        )}
      </div>

      {sendMsg && <div className={sendMsg.startsWith('✓') ? 'success' : 'muted'}>{sendMsg}</div>}
      <p className="muted small">TODO: финальную структуру/метрики отчёта согласовать с образцом Лилит.</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="metric"><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>;
}
