import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type Company } from '../api';

interface ErrorItem { text: string; severity: string }
interface DocItem { name: string; score: number; note: string }

// Common accounting document types Sona checks (suggestions for quick add).
const DOC_TYPES = [
  'Накладная', 'Счёт-фактура', 'Акт', 'Банковская выписка', 'Кассовый документ',
  'Налоговая декларация', 'Зарплатная ведомость', 'Авансовый отчёт', 'Договор',
];

// Areas of accounting paperwork Sona checks and rates per accountant.
// NOTE (TODO): final list/weights to be confirmed with Sona/Lilit; the model
// stores these under scores.areas, so areas can be changed without a migration.
const AREAS = [
  { id: 'primary_docs', label: 'Первичные документы' },
  { id: 'taxes', label: 'Налоговые отчёты / декларации' },
  { id: 'salary', label: 'Зарплата и кадры' },
  { id: 'bank', label: 'Банк и сверки' },
  { id: 'accuracy', label: 'Точность учёта / проводки' },
  { id: 'deadlines', label: 'Соблюдение сроков' },
];

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

const SCORE_LABELS = ['', 'Плохо', 'Слабо', 'Норма', 'Хорошо', 'Отлично'];

export function SonaForm() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [agrNo, setAgrNo] = useState('');
  const [accountant, setAccountant] = useState('');
  const [manager, setManager] = useState('');

  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [areaScores, setAreaScores] = useState<Record<string, number>>({});
  const [scoreClient, setScoreClient] = useState<number | ''>('');
  const [recordType, setRecordType] = useState('other');
  const [errors, setErrors] = useState<ErrorItem[]>([]);
  const [praise, setPraise] = useState('');
  const [comment, setComment] = useState('');
  const [ticketPriority, setTicketPriority] = useState('medium');
  const [ticketUrgent, setTicketUrgent] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ companies: Company[] }>('/companies').then((r) => setCompanies(r.companies)).catch(() => {});
  }, []);

  const selected = useMemo(() => companies.find((c) => c.agr_no === agrNo), [companies, agrNo]);

  useEffect(() => {
    if (selected) {
      setAccountant(selected.accountant ?? '');
      setManager(selected.manager ?? '');
    }
  }, [selected]);

  // Overall accountant score = average of all rated values (areas + documents).
  const ratedValues = [
    ...Object.values(areaScores).filter((v) => v > 0),
    ...documents.map((d) => d.score).filter((v) => v > 0),
  ];
  const overall = ratedValues.length
    ? Math.round((ratedValues.reduce((a, b) => a + b, 0) / ratedValues.length) * 10) / 10
    : null;

  function setArea(id: string, value: number) {
    setAreaScores((s) => ({ ...s, [id]: s[id] === value ? 0 : value }));
  }
  function addDocument() { setDocuments((d) => [...d, { name: '', score: 0, note: '' }]); }
  function updateDocument(i: number, patch: Partial<DocItem>) {
    setDocuments((d) => d.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeDocument(i: number) { setDocuments((d) => d.filter((_, idx) => idx !== i)); }
  function addError() { setErrors((e) => [...e, { text: '', severity: 'medium' }]); }
  function updateError(i: number, patch: Partial<ErrorItem>) {
    setErrors((e) => e.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function removeError(i: number) { setErrors((e) => e.filter((_, idx) => idx !== i)); }

  function reset() {
    setDocuments([]); setAreaScores({}); setScoreClient(''); setRecordType('other');
    setErrors([]); setPraise(''); setComment(''); setTicketUrgent(false); setTicketPriority('medium');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agrNo) { setMsg({ kind: 'err', text: 'Выберите компанию' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await api<{ review: any; ticket: any }>('/reviews', {
        method: 'POST',
        body: JSON.stringify({
          company_agr_no: agrNo,
          accountant, manager,
          score_accountant: overall,
          score_client: scoreClient === '' ? null : scoreClient,
          scores: {
            areas: areaScores,
            documents: documents.filter((d) => d.name.trim() || d.score > 0),
            overall,
            client: scoreClient === '' ? null : scoreClient,
          },
          record_type: recordType,
          errors: errors.filter((it) => it.text.trim()),
          praise: praise || null,
          comment: comment || null,
          ticket_priority: recordType === 'problem' ? ticketPriority : null,
          ticket_urgent: recordType === 'problem' ? ticketUrgent : false,
        }),
      });
      setMsg({ kind: 'ok', text: res.ticket ? 'Проверка сохранена. Создан тикет.' : 'Проверка сохранена.' });
      reset();
    } catch (err) {
      setMsg({ kind: 'err', text: 'Ошибка: ' + (err instanceof Error ? err.message : 'unknown') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="card">
        <div className="card-title">
          <h2>Проверка работы бухгалтера</h2>
          <span className="muted small">Ежедневная проверка бухгалтерской документации и оценка</span>
        </div>

        <CompanySelect companies={companies} value={agrNo} onChange={setAgrNo} />

        {selected && (
          <div className="company-info">
            <InfoChip label="Бухгалтер" value={accountant || '—'} accent />
            <InfoChip label="Менеджер" value={manager || '—'} />
            <InfoChip label="ИНН/ՀՎՀՀ" value={selected.hvhh || '—'} />
            <InfoChip label="Статус" value={selected.status} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Проверенные документы</h2>
          <button type="button" className="btn-soft" onClick={addDocument}>+ Добавить документ</button>
        </div>
        {documents.length === 0 && (
          <p className="muted small">Добавьте документы, которые проверяете, и оцените каждый. Можно несколько.</p>
        )}
        <datalist id="doc-types">{DOC_TYPES.map((d) => <option key={d} value={d} />)}</datalist>
        <div className="doc-list">
          {documents.map((d, i) => (
            <div className="doc-item" key={i}>
              <div className="doc-head">
                <span className="doc-num">#{i + 1}</span>
                <input list="doc-types" className="doc-name" placeholder="Тип / название документа"
                  value={d.name} onChange={(e) => updateDocument(i, { name: e.target.value })} />
                <RatingBar value={d.score} onChange={(v) => updateDocument(i, { score: d.score === v ? 0 : v })} />
                <button type="button" className="btn-icon" onClick={() => removeDocument(i)}>✕</button>
              </div>
              <input className="doc-note" placeholder="Замечание по документу (необязательно)"
                value={d.note} onChange={(e) => updateDocument(i, { note: e.target.value })} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <h2>Оценка по областям бухучёта</h2>
          {overall !== null && (
            <span className={`overall-badge band-${Math.round(overall)}`}>Итог: {overall} · {SCORE_LABELS[Math.round(overall)]}</span>
          )}
        </div>
        <div className="rating-list">
          {AREAS.map((a) => (
            <div className="rating-row" key={a.id}>
              <span className="rating-label">{a.label}</span>
              <RatingBar value={areaScores[a.id] ?? 0} onChange={(v) => setArea(a.id, v)} />
            </div>
          ))}
        </div>
        <div className="client-score">
          <span className="rating-label">Дисциплина клиента (предоставление документов)</span>
          <RatingBar value={typeof scoreClient === 'number' ? scoreClient : 0} onChange={(v) => setScoreClient(scoreClient === v ? '' : v)} />
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>Ошибки и замечания по документам</h2>
          <button type="button" className="btn-soft" onClick={addError}>+ Добавить</button>
        </div>
        {errors.length === 0 && <p className="muted small">Замечаний нет. Добавьте, если в документации найдены ошибки.</p>}
        {errors.map((it, i) => (
          <div className="error-item" key={i}>
            <input placeholder="Что не так в документах / учёте" value={it.text}
              onChange={(e) => updateError(i, { text: e.target.value })} />
            <select value={it.severity} onChange={(e) => updateError(i, { severity: e.target.value })}>
              <option value="low">низкая</option>
              <option value="medium">средняя</option>
              <option value="high">высокая</option>
            </select>
            <button type="button" className="btn-icon" onClick={() => removeError(i)}>✕</button>
          </div>
        ))}

        <div className="two-col">
          <label>Похвала<textarea value={praise} onChange={(e) => setPraise(e.target.value)} rows={2} placeholder="Что сделано хорошо" /></label>
          <label>Комментарий<textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Доп. контекст" /></label>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>Тип записи и тикет</h2></div>
        <div className="type-pills">
          {RECORD_TYPES.map((t) => (
            <button type="button" key={t.value}
              className={`type-pill t-${t.value} ${recordType === t.value ? 'active' : ''}`}
              onClick={() => setRecordType(t.value)}>{t.label}</button>
          ))}
        </div>

        {recordType === 'problem' && (
          <div className="ticket-box">
            <p className="muted small">Запись «Проблема» автоматически создаст тикет.</p>
            <div className="two-col">
              <label>Приоритет тикета
                <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value)}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label className="urgent-toggle">
                <input type="checkbox" checked={ticketUrgent} onChange={(e) => setTicketUrgent(e.target.checked)} />
                <span>🔴 ОЧЕНЬ СРОЧНО — исправить немедленно</span>
              </label>
            </div>
          </div>
        )}
        {recordType !== 'problem' && (
          <p className="muted small">Чисто позитивные записи («Похвала»/«Другое») тикет не создают.</p>
        )}
      </div>

      <div className="submit-bar">
        {msg && <div className={msg.kind === 'ok' ? 'success' : 'error'}>{msg.text}</div>}
        <button disabled={busy} type="submit" className="btn-primary-lg">{busy ? 'Сохранение…' : 'Сохранить проверку'}</button>
      </div>
    </form>
  );
}

function InfoChip({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`info-chip ${accent ? 'accent' : ''}`}>
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  );
}

function RatingBar({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="rating-bar">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n}
          className={`rate ${value >= n ? `on band-${value}` : ''}`}
          onClick={() => onChange(n)} title={SCORE_LABELS[n]}>{n}</button>
      ))}
    </div>
  );
}

function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = companies.find((c) => c.agr_no === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (q
    ? companies.filter((c) =>
        (c.name_agr ?? '').toLowerCase().includes(q) ||
        (c.name_tax ?? '').toLowerCase().includes(q) ||
        c.agr_no.includes(q) ||
        (c.accountant ?? '').toLowerCase().includes(q))
    : companies
  ).slice(0, 60);

  return (
    <div className="combobox" ref={ref}>
      <label>Компания</label>
      <button type="button" className="combo-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? `${selected.name_agr ?? selected.name_tax ?? selected.agr_no} (№${selected.agr_no})` : 'Выберите компанию…'}
        <span className="chevron">▾</span>
      </button>
      {open && (
        <div className="combo-pop">
          <input autoFocus placeholder="Поиск по названию, №, бухгалтеру…" value={query}
            onChange={(e) => setQuery(e.target.value)} />
          <div className="combo-list">
            {filtered.map((c) => (
              <button type="button" key={c.agr_no} className={`combo-item ${c.agr_no === value ? 'sel' : ''}`}
                onClick={() => { onChange(c.agr_no); setOpen(false); setQuery(''); }}>
                <span>{c.name_agr ?? c.name_tax ?? c.agr_no}</span>
                <span className="combo-meta">№{c.agr_no}{c.accountant ? ` · ${c.accountant}` : ''}</span>
              </button>
            ))}
            {filtered.length === 0 && <div className="muted small combo-empty">Ничего не найдено</div>}
          </div>
        </div>
      )}
    </div>
  );
}
