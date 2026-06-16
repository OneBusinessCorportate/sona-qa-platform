import { useEffect, useState } from 'react';
import { api, type Ticket } from '../api';

const STATUS = ['open', 'in_progress', 'done', 'cancelled'];
const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт', in_progress: 'В работе', done: 'Готов', cancelled: 'Отменён',
};

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  async function load() {
    const qs = new URLSearchParams();
    if (onlyUrgent) qs.set('urgent', '1');
    if (statusFilter) qs.set('status', statusFilter);
    const r = await api<{ tickets: Ticket[] }>(`/tickets?${qs.toString()}`);
    setTickets(r.tickets);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyUrgent, statusFilter]);

  async function changeStatus(id: string, status: string) {
    await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  return (
    <div className="card">
      <div className="report-head">
        <h2>Тикеты</h2>
        <label className="checkbox"><input type="checkbox" checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)} /> только 🔴 срочные</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">все статусы</option>
          {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      <table>
        <thead><tr><th>Компания</th><th>Бухгалтер</th><th>Приоритет</th><th>Срочно</th><th>Описание</th><th>Статус</th></tr></thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className={t.urgent ? 'urgent-row' : ''}>
              <td>{t.company_agr_no}</td>
              <td>{t.accountant ?? '—'}</td>
              <td><span className={`pill p-${t.priority}`}>{t.priority}</span></td>
              <td>{t.urgent ? '🔴' : ''}</td>
              <td>{t.description ?? t.title ?? '—'}</td>
              <td>
                <select value={t.status} onChange={(e) => changeStatus(t.id, e.target.value)}>
                  {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {tickets.length === 0 && <tr><td colSpan={6} className="muted">Тикетов нет</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
