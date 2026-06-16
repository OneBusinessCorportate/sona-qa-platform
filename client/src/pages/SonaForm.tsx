import { useEffect, useMemo, useState } from 'react';
import { api, type Company } from '../api';

interface ErrorItem { text: string; severity: string }

const RECORD_TYPES = [
  { value: 'other', label: 'Другое' },
  { value: 'problem', label: 'Проблема' },
  { value: 'praise', label: 'Похвала' },
];
const PRIORITIES = [
  { value: 'low', label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high', label: 'Высокий' },
  { value: 'critical', label: 'Критический' },
];

export function SonaForm() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agrNo, setAgrNo] = useState('');
  const [accountant, setAccountant] = useState('');
  const [manager, setManager] = useState('');
  const [scoreAccountant, setScoreAccountant] = useState<number | ''>('');
  const [scoreClient, setScoreClient] = useState<number | ''>('');
  const [recordType, setRecordType] = useState('other');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [praise, setPraise] = useState('');
  const [comment, setComment] = useState('');
  const [ticketPriority, setTicketPriority] = useState('medium');
  const [ticketUrgent, setTicketUrgent] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ companies: Company[] }>('/companies').then((r) => setCompanies(r.companies)).catch(() => {});
  }, []);

  const selected = useMemo(() => companies.find((c) => c.agr_no === agrNo), [companies, agrNo]);

  // Auto-fill accountant/manager when a company is picked.
  useEffect(() => {
    if (selected) {
      setAccountant(selected.accountant ?? '');
      setManager(selected.manager ?? '');
    }
  }, [selected]);

  function addError() { setErrors((e) => [...e, { text: '', severity: 'medium' }]); }
  function updateError(i: number, patch: Partial<ErrorItem>) {
    setErrors((e) => e.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeError(i: number) { setErrors((e) => e.filter((_, idx) => idx !== i)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agrNo) { setMsg('Выберите компанию'); return; }
    setBusy(true); setMsg('');
    try {
      const res = await api<{ review: any; ticket: any }>('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          company_agr_no: agrNo,
          accountant, manager,
          score_accountant: scoreAccountant === '' ? null : scoreAccountant,
          score_client: scoreClient === '' ? null : scoreClient,
          record_type: recordType,
          errors: errors.filter((it) => it.text.trim()),
          praise: praise || null,
          comment: comment || null,
          ticket_priority: recordType === 'problem' ? ticketPriority : null,
          ticket_urgent: recordType === 'problem' ? ticketUrgent : false,
        }),
      });
      setMsg(res.ticket ? '✓ Проверка сохранена. Создан тикет.' : '✓ Проверка сохранена.');
      // Reset the per-review fields, keep company selected for convenience.
      setScoreAccountant(''); setScoreClient(''); setRecordType('other');
      setErrors([]); setPraise(''); setComment(''); setTicketUrgent(false); setTicketPriority('medium');
    } catch (err) {
      setMsg('Ошибка: ' + (err instanceof Error ? err.message : 'unknown'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Ежедневная проверка качества</h2>

      <label>Компания
        <select value={agrNo} onChange={(e) => setAgrNo(e.target.value)}>
          <option value="">— выберите компанию —</option>
          {companies.map((c) => (
            <option key={c.agr_no} value={c.agr_no}>
              {c.name_agr ?? c.name_tax ?? c.agr_no} (№{c.agr_no})
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <label>Бухгалтер (авто)<input value={accountant} onChange={(e) => setAccountant(e.target.value)} /></label>
        <label>Менеджер (авто)<input value={manager} onChange={(e) => setManager(e.target.value)} /></label>
      </div>

      <div className="row">
        <label>Оценка бухгалтера
          <input type="number" min={0} max={5} step={0.5} value={scoreAccountant}
            onChange={(e) => setScoreAccountant(e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
        <label>Оценка клиента
          <input type="number" min={0} max={5} step={0.5} value={scoreClient}
            onChange={(e) => setScoreClient(e.target.value === '' ? '' : Number(e.target.value))} />
        </label>
      </div>

      <label>Тип записи
        <select value={recordType} onChange={(e) => setRecordType(e.target.value)}>
          {RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      <div className="errors-block">
        <div className="errors-head">
          <span>Ошибки / замечания</span>
          <button type="button" onClick={addError}>+ добавить</button>
        </div>
        {errors.map((it, i) => (
          <div className="row" key={i}>
            <input placeholder="Описание ошибки/замечания" value={it.text}
              onChange={(e) => updateError(i, { text: e.target.value })} />
            <select value={it.severity} onChange={(e) => updateError(i, { severity: e.target.value })}>
              <option value="low">низкая</option>
              <option value="medium">средняя</option>
              <option value="high">высокая</option>
            </select>
            <button type="button" className="ghost" onClick={() => removeError(i)}>×</button>
          </div>
        ))}
      </div>

      <label>Похвала<textarea value={praise} onChange={(e) => setPraise(e.target.value)} rows={2} /></label>
      <label>Комментарий<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} /></label>

      {recordType === 'problem' && (
        <div className="row ticket-opts">
          <label>Приоритет тикета
            <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={ticketUrgent} onChange={(e) => setTicketUrgent(e.target.checked)} />
            🔴 ОЧЕНЬ СРОЧНО
          </label>
        </div>
      )}

      {msg && <div className={msg.startsWith('✓') ? 'success' : 'error'}>{msg}</div>}
      <button disabled={busy} type="submit">{busy ? 'Сохранение…' : 'Сохранить проверку'}</button>
      <p className="muted small">Запись типа «Проблема» автоматически создаёт тикет. Чисто позитивные записи тикет не создают.</p>
    </form>
  );
}
