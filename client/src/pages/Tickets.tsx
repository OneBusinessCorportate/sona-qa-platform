import { Fragment, useEffect, useState } from 'react';
import { api, type Ticket, type TicketFeedback, type SonaComment } from '../api';

const STATUS = ['open', 'in_progress', 'done', 'cancelled'];
const STATUS_LABEL: Record<string, string> = {
  open: 'Открыт', in_progress: 'В работе', done: 'Готов', cancelled: 'Отменён',
};
const PRIORITY = ['medium', 'critical'];
const KK_STATUS_LABEL: Record<string, string> = {
  new: 'Новая',
  waiting_for_accountant: 'Ждёт бухгалтера',
  submitted_by_accountant: 'Отправлена бухгалтером',
  in_review: 'На проверке',
  fixed: 'Исправлено',
  explained_accepted: 'Объяснено / принято',
  returned_to_accountant: 'Возвращена бухгалтеру',
  auto_resolved: 'Снято автоматически',
};
const KK_ACTION_LABEL: Record<string, string> = {
  fixed: 'Исправлено',
  explained_accepted: 'Объяснено / принято',
  returned_to_accountant: 'Возвращена бухгалтеру',
  in_review: 'На проверке',
};
const fmtDate = (d: string) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(2, 4);
const fmtDateTime = (d: string) => new Date(d).toLocaleString('ru-RU');

type EditData = { description: string; priority: string; urgent: boolean; start_date: string; due_date: string };
type FeedbackCache = { feedback: TicketFeedback | null; comments: SonaComment[] };

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

  // Per-ticket feedback cache (loaded lazily when ticket is opened)
  const [feedbackCache, setFeedbackCache] = useState<Record<string, FeedbackCache>>({});
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Comment form for the currently open ticket
  const [commentDraft, setCommentDraft] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);

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

  async function loadFeedback(id: string) {
    if (feedbackCache[id]) return;
    setFeedbackLoading(true);
    try {
      const [fb, cm] = await Promise.all([
        api<{ feedback: TicketFeedback | null }>(`/tickets/${id}/feedback`),
        api<{ comments: SonaComment[] }>(`/tickets/${id}/comments`),
      ]);
      setFeedbackCache((prev) => ({ ...prev, [id]: { feedback: fb.feedback, comments: cm.comments } }));
    } catch {
      setFeedbackCache((prev) => ({ ...prev, [id]: { feedback: null, comments: [] } }));
    } finally {
      setFeedbackLoading(false);
    }
  }

  async function refreshComments(id: string) {
    const cm = await api<{ comments: SonaComment[] }>(`/tickets/${id}/comments`);
    setFeedbackCache((prev) => ({ ...prev, [id]: { ...prev[id], comments: cm.comments } }));
  }

  async function postComment(id: string) {
    const body = commentDraft.trim();
    if (!body) return;
    setCommentBusy(true);
    try {
      await api(`/tickets/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setCommentDraft('');
      await refreshComments(id);
    } finally {
      setCommentBusy(false);
    }
  }

  function openTicket(t: Ticket) {
    if (openId === t.id) { setOpenId(null); return; }
    setOpenId(t.id);
    setCommentDraft('');
    setEditData({
      description: t.description ?? t.title ?? '',
      priority: t.priority,
      urgent: t.urgent,
      start_date: t.start_date ?? '',
      due_date: t.due_date ?? '',
    });
    loadFeedback(t.id);
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
      <div className="ticket-filters">
        <h2>Тикеты</h2>
        <label className="date-field">
          с <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="date-field">
          по <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        {hasDateFilter && (
          <button type="button" className="btn-soft small"
            onClick={() => { setDateFrom(''); setDateTo(''); }}>
            × сбросить
          </button>
        )}
        <select className="ticket-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">все статусы</option>
          {STATUS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={onlyUrgent} onChange={(e) => setOnlyUrgent(e.target.checked)} />
          {' '}🔴 срочные
        </label>
      </div>

      {/* ── Ticket table ── */}
      <div className="ticket-table-wrap">
      <table className="ticket-table">
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
            const cached = feedbackCache[t.id];

            return (
              <Fragment key={t.id}>
                {/* ── Compact row ── */}
                <tr
                  className={t.urgent ? 'urgent-row' : ''}
                  onClick={() => openTicket(t)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ paddingRight: 0 }}>
                    <span className="ticket-caret">{isOpen ? '▼' : '▶'}</span>
                  </td>
                  <td><span className="ticket-co">{t.company_agr_no}</span></td>
                  <td>{t.accountant ?? '—'}</td>
                  <td><PriorityBadge priority={t.priority} urgent={t.urgent} /></td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {desc || <span className="muted">—</span>}
                  </td>
                  <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{period ?? '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select className={`ticket-status st-${t.status}`} value={t.status}
                      onChange={(e) => changeStatus(t.id, e.target.value)}>
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
                    <td colSpan={8} className="ticket-detail">
                      {/* Full description */}
                      {desc && <p className="ticket-desc">{desc}</p>}
                      {/* Edit fields */}
                      <div className="ticket-edit-grid">
                        <label style={{ flex: '0 0 140px' }}>
                          Приоритет
                          <select value={editData.priority}
                            onChange={(e) => setEditData((d) => ({ ...d, priority: e.target.value }))}>
                            {PRIORITY.map((p) => <option key={p} value={p}>{p === 'critical' ? 'критичный' : 'средний'}</option>)}
                          </select>
                        </label>
                        <label className="urgent-toggle" style={{ flex: '0 0 auto', alignSelf: 'flex-end', height: 40 }}>
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
                      <label style={{ display: 'block', marginBottom: 14 }}>
                        Описание
                        <textarea rows={3} value={editData.description}
                          onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))} />
                      </label>
                      <div className="ticket-edit-actions">
                        <button type="button" className="btn-primary-sm" disabled={editBusy}
                          onClick={() => saveEdit(t.id)}>
                          {editBusy ? 'Сохранение…' : 'Сохранить'}
                        </button>
                        <button type="button" className="btn-ghost" onClick={() => setOpenId(null)}>Закрыть</button>
                      </div>

                      {/* ── Accountant feedback section ── */}
                      <div className="ticket-feedback-section">
                        <div className="ticket-feedback-heading">Ответ бухгалтера</div>

                        {feedbackLoading && !cached && (
                          <p className="muted small">Загрузка…</p>
                        )}

                        {cached && !cached.feedback && (
                          <p className="muted small">Замечание ещё не попало в систему бухгалтеров.</p>
                        )}

                        {cached?.feedback && (
                          <>
                            <div className="ticket-feedback-status">
                              Статус:{' '}
                              <b>{KK_STATUS_LABEL[cached.feedback.kk_status ?? ''] || cached.feedback.kk_status || '—'}</b>
                            </div>

                            {cached.feedback.situation_comment ? (
                              <div className="ticket-feedback-block">
                                <div className="ticket-feedback-label">Ситуация</div>
                                <div className="ticket-feedback-text">{cached.feedback.situation_comment}</div>
                                {cached.feedback.accountant_name && (
                                  <div className="muted small" style={{ marginTop: 4 }}>
                                    {cached.feedback.accountant_name}
                                    {cached.feedback.feedback_submitted_at && (
                                      <> · {fmtDateTime(cached.feedback.feedback_submitted_at)}</>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="muted small">Бухгалтер ещё не заполнил форму.</p>
                            )}

                            {cached.feedback.solution_comment && (
                              <div className="ticket-feedback-block">
                                <div className="ticket-feedback-label">Решение</div>
                                <div className="ticket-feedback-text">{cached.feedback.solution_comment}</div>
                              </div>
                            )}

                            {cached.feedback.review_action && (
                              <div className="ticket-feedback-block">
                                <div className="ticket-feedback-label">
                                  Решение проверяющего:{' '}
                                  <b>{KK_ACTION_LABEL[cached.feedback.review_action] || cached.feedback.review_action}</b>
                                  {cached.feedback.reviewer_name && <> · {cached.feedback.reviewer_name}</>}
                                  {cached.feedback.review_acted_at && <> · {fmtDateTime(cached.feedback.review_acted_at)}</>}
                                </div>
                                {cached.feedback.review_comment && (
                                  <div className="ticket-feedback-text">{cached.feedback.review_comment}</div>
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* ── Comment thread ── */}
                        {cached && (
                          <div className="ticket-comments-section">
                            <div className="ticket-feedback-label" style={{ marginBottom: 6 }}>
                              Комментарии ({cached.comments.length})
                            </div>
                            {cached.comments.map((c) => (
                              <div key={c.id} className="ticket-comment-item">
                                <span className="ticket-comment-meta">
                                  <b>{c.author}</b> · {fmtDateTime(c.created_at)}
                                </span>
                                <div className="ticket-comment-body">{c.body}</div>
                              </div>
                            ))}
                            <div style={{ marginTop: 10 }}>
                              <textarea
                                rows={2}
                                placeholder="Добавить комментарий к ответу бухгалтера…"
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6 }}
                              />
                              <button
                                type="button"
                                className="btn-primary-sm"
                                disabled={!commentDraft.trim() || commentBusy}
                                onClick={() => postComment(t.id)}
                              >
                                {commentBusy ? 'Отправка…' : 'Отправить комментарий'}
                              </button>
                            </div>
                          </div>
                        )}
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
    </div>
  );
}
