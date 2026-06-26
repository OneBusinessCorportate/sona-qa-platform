import { Fragment, useEffect, useState } from 'react';
import { api, type Ticket } from '../api';

const STATUS = ['open', 'in_progress', 'done', 'cancelled'];
const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт', in_progress: 'В работе', done: 'Готов', cancelled: 'Отменён',
};
const PRIORITY = ['medium', 'critical'];

type EditData = { description: string; priority: string; urgent: boolean };

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData>({ description: '', priority: 'medium', urgent: false });
  const [editBusy, setEditBusy] = useState(false);

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

  async function changeDate(id: string, field: 'start_date' | 'due_date', value: string | null) {
    await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Удалить тикет?')) return;
    await api(`/tickets/${id}`, { method: 'DELETE' });
    load();
  }

  function startEdit(t: Ticket) {
    setEditId(t.id);
    setEditData({ description: t.description ?? t.title ?? '', priority: t.priority, urgent: t.urgent });
  }

  async function saveEdit(id: string) {
    setEditBusy(true);
    try {
      await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(editData) });
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
        <label className="checkbox"><input type="checkbox" checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)} /> только 🔴 срочные</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">все статусы</option>
          {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
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
                <td style={{ whiteSpace: 'nowrap' }}>
                  <input type="date" value={t.start_date ?? ''} title="Начало периода"
                    style={{ width: 130, marginRight: 4 }}
                    onChange={(e) => changeDate(t.id, 'start_date', e.target.value || null)} />
                  <input type="date" value={t.due_date ?? ''} title="Конец периода"
                    style={{ width: 130 }}
                    onChange={(e) => changeDate(t.id, 'due_date', e.target.value || null)} />
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
