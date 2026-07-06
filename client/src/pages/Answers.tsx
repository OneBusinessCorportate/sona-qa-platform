import { useEffect, useState } from 'react';
import { api } from '../api';

// Aggregated feed of accountant responses: every feedback form, comment and
// attachment sent back on Sona's tickets, newest activity first — no need to
// expand tickets one by one on the Tickets tab.

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
const fmtDateTime = (d: string) => new Date(d).toLocaleString('ru-RU');

interface FeedItem {
  ticket_id: string;
  problem_id: string;
  title: string | null;
  client_name: string | null;
  accountant_name: string | null;
  kk_status: string | null;
  feedbacks: Array<{ situation_comment: string; solution_comment: string; submitted_at: string; accountant_name: string | null }>;
  comments: Array<{ author: string; body: string; created_at: string }>;
  attachments: Array<{ file_name: string; public_url: string; mime_type: string | null; uploaded_by: string | null }>;
  last_activity: string | null;
}

export function Answers() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ items: FeedItem[] }>('/tickets/feed');
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function reply(ticketId: string) {
    const body = (drafts[ticketId] ?? '').trim();
    if (!body) return;
    setPosting(ticketId);
    try {
      await api(`/tickets/${ticketId}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      setDrafts((d) => ({ ...d, [ticketId]: '' }));
      await load();
    } finally {
      setPosting(null);
    }
  }

  // Sona's decision on the answer: close the case, or send it back so the
  // accountant must respond again (the comment explains why and is required).
  async function resolve(ticketId: string, action: 'close' | 'return') {
    const comment = (drafts[ticketId] ?? '').trim();
    if (action === 'return' && !comment) return;
    setPosting(ticketId);
    try {
      await api(`/tickets/${ticketId}/resolve`, { method: 'POST', body: JSON.stringify({ action, comment }) });
      setDrafts((d) => ({ ...d, [ticketId]: '' }));
      await load();
    } finally {
      setPosting(null);
    }
  }

  return (
    <div className="report">
      <div className="card">
        <div className="report-head">
          <h2>💬 Ответы бухгалтеров</h2>
          <button className="btn-soft" onClick={load} disabled={loading}>{loading ? 'Загрузка…' : 'Обновить'}</button>
        </div>
        {!loading && items.length === 0 && (
          <p className="muted">Бухгалтеры пока ничего не отправляли по вашим замечаниям.</p>
        )}
      </div>

      {items.map((it) => (
        <div className="card" key={it.problem_id}>
          <div className="report-head">
            <h3 style={{ margin: 0 }}>
              {it.title ?? `Тикет ${it.ticket_id}`}
              {it.client_name && <span className="muted"> — {it.client_name}</span>}
            </h3>
            <span className="muted small">
              {it.accountant_name ?? '—'}
              {it.kk_status && <> · {KK_STATUS_LABEL[it.kk_status] ?? it.kk_status}</>}
            </span>
          </div>

          {it.feedbacks.map((f, i) => (
            <div className="ticket-feedback-block" key={i}>
              <div className="ticket-feedback-label">Ситуация</div>
              <div className="ticket-feedback-text">{f.situation_comment}</div>
              <div className="ticket-feedback-label" style={{ marginTop: 8 }}>Решение</div>
              <div className="ticket-feedback-text">{f.solution_comment}</div>
              <div className="muted small" style={{ marginTop: 4 }}>
                {f.accountant_name ?? '—'} · {fmtDateTime(f.submitted_at)}
              </div>
            </div>
          ))}
          {it.feedbacks.length === 0 && (
            <p className="muted small">Форма ещё не заполнена — есть только комментарии/файлы.</p>
          )}

          {it.attachments.length > 0 && (
            <div className="ticket-feedback-block">
              <div className="ticket-feedback-label">Вложения</div>
              <div className="ticket-attachments">
                {it.attachments.map((a, i) => (
                  <a key={i} href={a.public_url} target="_blank" rel="noreferrer" className="ticket-attachment">
                    {(a.mime_type ?? '').startsWith('image/') ? '🖼' : '📎'} {a.file_name}
                    {a.uploaded_by && <span className="muted small"> · {a.uploaded_by}</span>}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="ticket-comments-section">
            <div className="ticket-feedback-label" style={{ marginBottom: 6 }}>
              Комментарии ({it.comments.length})
            </div>
            {it.comments.map((c, i) => (
              <div key={i} className="ticket-comment-item">
                <span className="ticket-comment-meta"><b>{c.author}</b> · {fmtDateTime(c.created_at)}</span>
                <div className="ticket-comment-body">{c.body}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <input
                placeholder="Комментарий (обязателен при возврате)…"
                value={drafts[it.ticket_id] ?? ''}
                onChange={(e) => setDrafts((d) => ({ ...d, [it.ticket_id]: e.target.value }))}
                style={{ flex: '1 1 240px' }}
              />
              <button
                className="btn-soft"
                disabled={posting === it.ticket_id || !(drafts[it.ticket_id] ?? '').trim()}
                onClick={() => reply(it.ticket_id)}
              >
                {posting === it.ticket_id ? 'Отправка…' : 'Отправить'}
              </button>
              <button
                className="btn-soft"
                title="Комментарий обязателен — бухгалтер получит вопрос обратно и ответит снова"
                disabled={posting === it.ticket_id || !(drafts[it.ticket_id] ?? '').trim()}
                onClick={() => resolve(it.ticket_id, 'return')}
              >
                ↩ Вернуть бухгалтеру
              </button>
              <button
                className="btn-soft"
                title="Вопрос решён — снимается с бухгалтера и закрывает тикет"
                disabled={posting === it.ticket_id}
                onClick={() => resolve(it.ticket_id, 'close')}
              >
                ✓ Закрыть
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
