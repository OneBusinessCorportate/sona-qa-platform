import { Fragment, useEffect, useState } from 'react';
import { api, type Ticket } from '../api';

const STATUS = ['open', 'in_progress', 'done', 'cancelled'];
const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт', in_progress: 'В работе', done: 'Готов', cancelled: 'Отменён',
};
const PRIORITY = ['medium', 'critical'];
const fmtDate = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(2, 4);

type EditData = { description: string; priority: string; urgent: boolean; start_date: string; due_date: string };

function PriorityBadge({ priority, urgent }: { priority: string; urgent: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {urgent && <span title="Срочно" style={{ fontSize: 13 }}>🔴</span>}
      <span className={`pill p-${priority}`}>{priority === 'critical' ? 'критичный' : 'средний'}</span>
    </span>
  );
}

export function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [onlyUrgent, setOnlyUrgent] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
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

  function openTicket(t: Ticket) {
    if (openId === t.id) { setOpenId(null); return; }
    setOpenId(t.id);
    setEditData({
      description: t.description ?? t.title ?? '',
      priority: t.priority,
      urgent: t.urgent,
      start_date: t.start_date ?? '',
      due_date: t.due_date ?? '',
    });
  }

  async function changeStatus(id: string, status: string) {
    await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  async function remove(id: string) {
    if (!confirm('Удалить тикет?')) return;
    await api(`/tickets/${id}`, { method: 'DELETE' });
    if (openId === id) setOpenId(null);
    load();
  }

  async function saveEdit(id: string) {
    setEditBusy(true);
    try {
      const body: any = { ...editData };
      if (!body.start_date) body.start_date = null;
      if (!body.due_date) body.due_date = null;
      await api(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setOpenId(null);
      load();
    } finally {
      setEditBusy(false);
    }
  }

  const hasDateFilter = dateFrom || dateTo;

  return (
    <div className="card">
      {/* ── Filter bar ── */}
      <div className="report-head">
        <h2>Тикеты</h2>
        <label className="small">
          с&nbsp;<input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="small">
          по&nbsp;<input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {hasDateFilter && (
          <button type="button" className="btn-soft small"
            onClick={() => { setDateFrom(''); setDateTo(''); }}>
            × сбросить
          </button>
        )}
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">все статусы</option>
          {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)} />
          {' '}🔴 срочные
        </label>
      </div>

      {/* ── Ticket table ── */}
      <table>
        <thead>
          <tr>
            <th style={{ width: 20 }} />
            <th>Компания</th>
            <th>Бухгалтер</th>
            <th>Приоритет</th>
            <th>Описание</th>
            <th>Период</th>
            <th>Статус</th>
            <th style={{ width: 36 }} />
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => {
            const isOpen = openId === t.id;
            const desc = t.description ?? t.title ?? '';
            const period = (t.start_date || t.due_date)
              ? `${t.start_date ? fmtDate(t.start_date) : '…'} — ${t.due_date ? fmtDate(t.due_date) : '…'}`
              : null;

            return (
              <Fragment key={t.id}>
                {/* ── Compact row ── */}
                <tr
                  className={t.urgent ? 'urgent-row' : ''}
                  onClick={() => openTicket(t)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="muted" style={{ fontSize: 9, textAlign: 'center', paddingRight: 0 }}>
                    {isOpen ? '▼' : '▶'}
                  </td>
                  <td style={{ fontWeight: 500 }}>{t.company_agr_no}</td>
                  <td>{t.accountant ?? '—'}</td>
                  <td><PriorityBadge priority={t.priority} urgent={t.urgent} /></td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {desc || <span className="muted">—</span>}
                  </td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{period ?? '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={t.status} onChange={(e) => changeStatus(t.id, e.target.value)}>
                      {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn-icon" title="Удалить"
                      onClick={() => remove(t.id)}>✕</button>
                  </td>
                </tr>

                {/* ── Expanded detail / edit ── */}
                {isOpen && (
                  <tr>
                    <td colSpan={8} style={{ padding: '16px 20px', background: 'var(--surface2, #f8f9fa)', borderTop: 'none' }}>
                      {/* Full description */}
                      {desc && (
                        <p style={{ margin: '0 0 14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{desc}</p>
                      )}
                      {/* Edit fields */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                        <label style={{ flex: '0 0 140px' }}>
                          Приоритет
                          <select value={editData.priority}
                            onChange={(e) => setEditData((d) => ({ ...d, priority: e.target.value }))}>
                            {PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </label>
                        <label style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 20 }}>
                          <input type="checkbox" checked={editData.urgent}
                            onChange={(e) => setEditData((d) => ({ ...d, urgent: e.target.checked }))} />
                          🔴 Срочно
                        </label>
                        <label style={{ flex: '0 0 150px' }}>
                          Период с
                          <input type="date" value={editData.start_date}
                            onChange={(e) => setEditData((d) => ({ ...d, start_date: e.target.value }))} />
                        </label>
                        <label style={{ flex: '0 0 150px' }}>
                          по
                          <input type="date" value={editData.due_date}
                            onChange={(e) => setEditData((d) => ({ ...d, due_date: e.target.value }))} />
                        </label>
                      </div>
                      <label style={{ display: 'block', marginBottom: 12 }}>
                        Описание
                        <textarea rows={3} value={editData.description}
                          onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))} />
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="btn-soft" disabled={editBusy}
                          onClick={() => saveEdit(t.id)}>
                          {editBusy ? 'Сохранение…' : 'Сохранить'}
                        </button>
                        <button type="button" className="btn-soft" onClick={() => setOpenId(null)}>Закрыть</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {tickets.length === 0 && (
            <tr>
              <td colSpan={8} className="muted" style={{ textAlign: 'center', padding: '28px 0' }}>
                Тикетов нет{hasDateFilter ? ' за выбранный период' : ''}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
