import { Fragment, useEffect, useState } from 'react';
import {
  api,
  type SonaTicketsDaily, type SonaTicketCheck, type AccountantResponse,
  type AppealDecision, type ConfirmationStatus, type AccountantTask,
} from '../api';

const today = () => new Date().toISOString().slice(0, 10);
const REPORT_LABEL: Record<string, string> = { vat: 'НДС', turnover: 'Оборот', other: 'Другое' };
const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${v}%`);

const CONFIRM_LABEL: Record<ConfirmationStatus, string> = {
  pending: 'Ожидает подтверждения',
  confirmed: '✅ Подтверждено',
  incorrect: '❌ Неверно',
  needs_review: '⚠️ Требует проверки',
};
const RESPONSE_LABEL: Record<AccountantResponse, string> = {
  pending: 'нет ответа', agreed: 'согласен', appealed: 'апелляция',
};
const TASK_STATUS_LABEL: Record<string, string> = {
  open: 'Открыта', in_progress: 'В работе', done: 'Готова', cancelled: 'Отменена',
};

// "Подсчёт тикетов" — daily ticket/check count that Sona confirms. Uses exactly the
// same source of truth (/reports/tickets-daily) as the Telegram report, so the
// numbers here and in Telegram always match.
export function SonaTickets() {
  const [date, setDate] = useState(today());
  const [data, setData] = useState<SonaTicketsDaily | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function load() {
    setLoading(true);
    try {
      setData(await api<SonaTicketsDaily>(`/reports/tickets-daily?date=${date}`));
    } catch (e) {
      setMsg('Ошибка загрузки: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  async function sendTelegram() {
    setMsg('Отправка в Telegram…');
    try {
      const r = await api<{ ok: boolean; skipped?: boolean; error?: string }>('/reports/send', {
        method: 'POST', body: JSON.stringify({ kind: 'tickets', date }),
      });
      setMsg(r.ok ? '✓ Отправлено в Telegram' : r.skipped ? 'Telegram не настроен' : 'Ошибка: ' + r.error);
    } catch (e) {
      setMsg('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'));
    }
  }

  const conf = data?.confirmation ?? null;
  const status: ConfirmationStatus = conf?.confirmationStatus ?? 'pending';

  return (
    <div className="report">
      <div className="card">
        <div className="report-head">
          <h2>📊 Подсчёт тикетов за день</h2>
          <label className="small">дата <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <button className="btn-soft" onClick={load} disabled={loading}>{loading ? '…' : 'Обновить'}</button>
          <button onClick={sendTelegram}>Отправить в Telegram</button>
        </div>

        {data && (
          <>
            <div className="metrics">
              <Metric label="Всего проверок (бот)" value={data.total} />
              <Metric label="Из них тикетов" value={data.ticketsCreated} />
              <Metric label="Бухгалтеров" value={data.byAccountant.length} />
              <Metric label="Статус" value={CONFIRM_LABEL[status]} />
              {conf?.correctedTotal != null && <Metric label="Исправлено Sona" value={conf.correctedTotal} />}
            </div>
            <p className="muted small" style={{ marginTop: -4 }}>
              Подсчёт по <b>дате проверки</b> (checking_date), AI и Маргарита исключены — те же цифры, что в Telegram-отчёте.
            </p>
          </>
        )}
      </div>

      {data && <ConfirmCard date={date} data={data} onSaved={setData} />}
      {data && <ResponsesCard data={data} />}
      {data && <ChecksCard date={date} data={data} onChanged={load} />}
      <TasksCard date={date} />

      {msg && <div className={msg.startsWith('✓') ? 'success' : 'muted'} style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="metric"><div className="metric-value">{value}</div><div className="metric-label">{label}</div></div>;
}

// ── Confirmation controls ────────────────────────────────────────────────────
function ConfirmCard({ date, data, onSaved }: {
  date: string; data: SonaTicketsDaily; onSaved: (d: SonaTicketsDaily) => void;
}) {
  const conf = data.confirmation;
  const [corrected, setCorrected] = useState(conf?.correctedTotal != null ? String(conf.correctedTotal) : '');
  const [comment, setComment] = useState(conf?.sonaComment ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    setCorrected(conf?.correctedTotal != null ? String(conf.correctedTotal) : '');
    setComment(conf?.sonaComment ?? '');
  }, [conf?.checkDate, conf?.correctedTotal, conf?.sonaComment]);

  async function save(confirmation_status: ConfirmationStatus) {
    setBusy(true); setSaved('');
    try {
      const body: any = { date, confirmation_status, comment };
      if (confirmation_status === 'incorrect') body.corrected_total = corrected === '' ? null : Number(corrected);
      const updated = await api<SonaTicketsDaily>('/reports/tickets-daily/confirm', {
        method: 'PUT', body: JSON.stringify(body),
      });
      onSaved(updated);
      setSaved('✓ Сохранено');
    } catch (e) {
      setSaved('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="report-head"><h3 style={{ margin: 0 }}>Подтверждение Sona</h3></div>
      <p className="muted small">
        Бот посчитал <b>{data.total}</b> проверок за {date}. Совпадает ли это с реальным количеством?
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button className="btn-soft" disabled={busy} onClick={() => save('confirmed')}>✅ Верно</button>
        <button className="btn-soft" disabled={busy} onClick={() => save('incorrect')}>❌ Неверно</button>
        <button className="btn-soft" disabled={busy} onClick={() => save('needs_review')}>⚠️ Требует проверки</button>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ flex: '0 0 220px' }}>
          Исправленное число (если неверно)
          <input inputMode="numeric" placeholder={String(data.total)} value={corrected}
            onChange={(e) => setCorrected(e.target.value)} />
        </label>
        <label style={{ flex: '1 1 320px' }}>
          Комментарий
          <input placeholder="Что не так с подсчётом?" value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
      </div>
      {conf?.confirmedAt && (
        <p className="muted small" style={{ marginTop: 8 }}>
          Последнее подтверждение: {new Date(conf.confirmedAt).toLocaleString('ru-RU')} — {CONFIRM_LABEL[conf.confirmationStatus]}
        </p>
      )}
      {saved && <div className={saved.startsWith('✓') ? 'success' : 'error'} style={{ marginTop: 8 }}>{saved}</div>}
    </div>
  );
}

// ── Agreement / appeal summary + per-accountant breakdown ────────────────────
function ResponsesCard({ data }: { data: SonaTicketsDaily }) {
  const r = data.responses;
  return (
    <div className="card">
      <div className="report-head"><h3 style={{ margin: 0 }}>Согласия и апелляции</h3></div>
      <div className="metrics">
        <Metric label="Всего проверено" value={r.total} />
        <Metric label="Согласны" value={r.agreed} />
        <Metric label="Апелляции" value={r.appealed} />
        <Metric label="Апелляций принято" value={r.appealAccepted} />
        <Metric label="Апелляций отклонено" value={r.appealRejected} />
        <Metric label="Без ответа" value={r.pending} />
      </div>
      <table>
        <thead><tr>
          <th>Бухгалтер</th><th>Проверок</th><th>Согласны</th><th>Апелляции</th>
          <th>Принято</th><th>Отклонено</th><th>Без ответа</th>
        </tr></thead>
        <tbody>
          {data.byAccountant.map((a) => (
            <tr key={a.accountant}>
              <td>{a.accountant}</td><td><b>{a.count}</b></td><td>{a.agreed}</td><td>{a.appealed}</td>
              <td>{a.appealAccepted}</td><td>{a.appealRejected}</td><td>{a.pending}</td>
            </tr>
          ))}
          {data.byAccountant.length === 0 && <tr><td colSpan={7} className="muted">Нет проверок за день</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Detected checks with evidence + per-check controls ───────────────────────
function ChecksCard({ date, data, onChanged }: {
  date: string; data: SonaTicketsDaily; onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setResponse(c: SonaTicketCheck, patch: { accountant_response_status?: AccountantResponse; sona_appeal_decision?: AppealDecision }) {
    setBusyId(c.id);
    try {
      await api(`/reviews/${c.id}/response`, { method: 'PATCH', body: JSON.stringify(patch) });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function addTask(c: SonaTicketCheck) {
    const description = prompt(`Задача по проверке (${c.companyName ?? c.companyAgrNo}):`, c.evidence ?? 'Проверить');
    if (!description) return;
    setBusyId(c.id);
    try {
      await api('/accountant-tasks', {
        method: 'POST',
        body: JSON.stringify({
          task_date: date, accountant: c.accountant, review_id: c.id, ticket_id: c.ticketId,
          description, source: 'sona_ticket_check', priority: c.hasTicket ? 'critical' : null,
        }),
      });
      alert('Добавлено в трекер задач бухгалтеров.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <div className="report-head"><h3 style={{ margin: 0 }}>Проверки с доказательством</h3></div>
      <div className="ticket-table-wrap">
        <table>
          <thead><tr>
            <th>Компания</th><th>Бухгалтер</th><th>Отчёт</th><th>Оценка</th>
            <th>Тикет</th><th>Ответ</th><th>Действия</th>
          </tr></thead>
          <tbody>
            {data.checks.map((c) => (
              <Fragment key={c.id}>
                <tr>
                  <td>{c.companyName ?? c.companyAgrNo}</td>
                  <td>{c.accountant}</td>
                  <td>{c.reportType ? (REPORT_LABEL[c.reportType] ?? c.reportType) : '—'}</td>
                  <td>{pct(c.efficiencyPct)}</td>
                  <td>{c.hasTicket ? <span className="pill p-high">тикет</span> : ''}</td>
                  <td>
                    <span className={`pill ${c.accountantResponse === 'agreed' ? 'p-low' : c.accountantResponse === 'appealed' ? 'p-medium' : ''}`}>
                      {RESPONSE_LABEL[c.accountantResponse]}
                    </span>
                    {c.appealDecision && <span className="muted small"> · {c.appealDecision === 'accepted' ? 'принята' : 'отклонена'}</span>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-icon" title="Согласен" disabled={busyId === c.id}
                      onClick={() => setResponse(c, { accountant_response_status: c.accountantResponse === 'agreed' ? 'pending' : 'agreed' })}>👍</button>
                    <button className="btn-icon" title="Апелляция" disabled={busyId === c.id}
                      onClick={() => setResponse(c, { accountant_response_status: c.accountantResponse === 'appealed' ? 'pending' : 'appealed' })}>⚖️</button>
                    <button className="btn-icon" title="Апелляция принята" disabled={busyId === c.id}
                      onClick={() => setResponse(c, { sona_appeal_decision: c.appealDecision === 'accepted' ? null : 'accepted' })}>✅</button>
                    <button className="btn-icon" title="Апелляция отклонена" disabled={busyId === c.id}
                      onClick={() => setResponse(c, { sona_appeal_decision: c.appealDecision === 'rejected' ? null : 'rejected' })}>🚫</button>
                    <button className="btn-icon" title="В трекер задач" disabled={busyId === c.id}
                      onClick={() => addTask(c)}>➕</button>
                  </td>
                </tr>
                {c.evidence && (
                  <tr className="review-comment-row"><td colSpan={7} className="muted small">📝 {c.evidence}</td></tr>
                )}
              </Fragment>
            ))}
            {data.checks.length === 0 && <tr><td colSpan={7} className="muted">Проверок за день нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Accountant system-task tracker ───────────────────────────────────────────
function TasksCard({ date }: { date: string }) {
  const [tasks, setTasks] = useState<AccountantTask[]>([]);
  const [desc, setDesc] = useState('');
  const [accountant, setAccountant] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await api<{ tasks: AccountantTask[] }>(`/accountant-tasks?date=${date}`);
    setTasks(r.tasks);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [date]);

  async function add() {
    if (!desc.trim()) return;
    setBusy(true);
    try {
      await api('/accountant-tasks', {
        method: 'POST',
        body: JSON.stringify({ task_date: date, accountant: accountant || null, description: desc, source: 'manual' }),
      });
      setDesc(''); setAccountant('');
      load();
    } finally {
      setBusy(false);
    }
  }
  async function setStatus(id: string, status: string) {
    await api(`/accountant-tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }
  async function remove(id: string) {
    if (!confirm('Удалить задачу?')) return;
    await api(`/accountant-tasks/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="card">
      <div className="report-head"><h3 style={{ margin: 0 }}>Трекер задач бухгалтеров</h3></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <input placeholder="Бухгалтер (необязательно)" value={accountant} style={{ flex: '0 0 200px' }}
          onChange={(e) => setAccountant(e.target.value)} />
        <input placeholder="Описание задачи" value={desc} style={{ flex: '1 1 320px' }}
          onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn-soft" disabled={busy || !desc.trim()} onClick={add}>+ Добавить</button>
      </div>
      <table>
        <thead><tr><th>Задача</th><th>Бухгалтер</th><th>Источник</th><th>Статус</th><th></th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>{t.description}{t.priority === 'critical' && <span className="pill p-critical" style={{ marginLeft: 6 }}>срочно</span>}</td>
              <td>{t.accountant ?? '—'}</td>
              <td className="muted small">{t.source === 'sona_ticket_check' ? 'проверка' : t.source === 'appeal' ? 'апелляция' : 'вручную'}</td>
              <td>
                <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>
                  {Object.entries(TASK_STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
              <td><button className="btn-icon" title="Удалить" onClick={() => remove(t.id)}>✕</button></td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td colSpan={5} className="muted">Задач на эту дату нет</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
