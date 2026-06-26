import { Fragment, useEffect, useState } from 'react';
import { api, type Ticket } from '../api';

const STATUS = ['open', 'in_progress', 'done', 'cancelled'];
const fmtDate = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(2, 4);
const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт', in_progress: 'В работе', done: 'Готов', cancelled: 'Отменён',
};
const PRIORITY = ['medium', 'critical'];

type EditData = { description: string; priority: string; urgent: boolean; start_date: string; due_date: string };

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({ description: '', priority: 'medium', urgent: false, start_date: '', due_date: '' });
  const [editBusy, setEditBusy] = useState(false);

  async function load() {
    const qs = new URLSearchParams();
    if (onlyUrgent) qs.set('urgent', '1');
    if (statusFilter) qs.set('status', statusFilter);
    if (dateFrom) qs.set('from', dateFrom);
    if (dateTo) qs.set('to', dateTo);
    const r = await api<{ tickets: Ticket[] }>(`/tickets?${qs.toString()}`);
    setTickets(r.tickets);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [onlyUrgent, statusFilter, dateFrom, dateTo]);

  async function changeStatus(id: string, status: string) {
    await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Удалить тикет?')) return;
    await api(`/tickets/${id}`, { method: 'DELETE' });
    load();
  }

  function startEdit(t: Ticket) {
    setEditId(t.id);
    setEditData({ description: t.description ?? t.title ?? '', priority: t.priority, urgent: t.urgent, start_date: t.start_date ?? '', due_date: t.due_date ?? '' });
  }

  async function saveEdit(id: string) {
    setEditBusy(true);
    try {
      const body: any = { ...editData };
      if (!body.start_date) body.start_date = null;
      if (!body.due_date) body.due_date = null;
      await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditId(null);
      load();
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="report-head">
        <h2>Тикеты</h2>
        <label className="small">с&nbsp;<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="small">по&nbsp;<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        {(dateFrom || dateTo) && (
          <button type="button" className="btn-soft small" onClick={() => { setDateFrom(''); setDateTo(''); }}>× сбросить</button>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">все статусы</option>
          {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="checkbox"><input type="checkbox" checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)} /> только 🔴 срочные</label>
      </div>
      <table>
        <thead><tr><th>Компания</th><th>Бухгалтер</th><th>Приоритет</th><th>Срочно</th><th>Описание</th><th>Период</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          {tickets.map((t) => (
            <Fragment key={t.id}>
              <tr className={t.urgent ? 'urgent-row' : ''}>
                <td>{t.company_agr_no}</td>
                <td>{t.accountant ?? '—'}</td>
                <td><span className={`pill p-${t.priority}`}>{t.priority}</span></td>
                <td>{t.urgent ? '🔴' : ''}</td>
                <td>{t.description ?? t.title ?? '—'}</td>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>
                  {t.start_date || t.due_date
                    ? `${t.start_date ? fmtDate(t.start_date) : '…'} — ${t.due_date ? fmtDate(t.due_date) : '…'}`
                    : '—'}
                </td>
                <td>
                  <select value={t.status} onChange={(e) => changeStatus(t.id, e.target.value)}>
                    {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn-icon" title="Редактировать"
                    onClick={() => editId === t.id ? setEditId(null) : startEdit(t)}>✎</button>
                  <button type="button" className="btn-icon" title="Удалить" onClick={() => remove(t.id)}>✕</button>
                </td>
              </tr>
              {editId === t.id && (
                <tr>
                  <td colSpan={8} style={{ padding: '12px 14px', background: 'var(--surface2, #f8f9fa)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                      <label style={{ flex: '0 0 120px' }}>
                        Приоритет
                        <select value={editData.priority} onChange={(e) => setEditData((d) => ({ ...d, priority: e.target.value }))}>
                          {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </label>
                      <label style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 20 }}>
                        <input type="checkbox" checked={editData.urgent}
                          onChange={(e) => setEditData((d) => ({ ...d, urgent: e.target.checked }))} />
                        🔴 Срочно
                      </label>
                      <label style={{ flex: '0 0 140px' }}>
                        С
                        <input type="date" value={editData.start_date}
                          onChange={(e) => setEditData((d) => ({ ...d, start_date: e.target.value }))} />
                      </label>
                      <label style={{ flex: '0 0 140px' }}>
                        По
                        <input type="date" value={editData.due_date}
                          onChange={(e) => setEditData((d) => ({ ...d, due_date: e.target.value }))} />
                      </label>
                    </div>
                    <label style={{ display: 'block', marginBottom: 10 }}>
                      Описание
                      <textarea rows={3} value={editData.description}
                        onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))} />
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn-soft" disabled={editBusy} onClick={() => saveEdit(t.id)}>
                        {editBusy ? 'Сохранение…' : 'Сохранить'}
                      </button>
                      <button type="button" className="btn-soft" onClick={() => setEditId(null)}>Отмена</button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {tickets.length === 0 && <tr><td colSpan={8} className="muted">Тикетов нет</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
