import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, type CompaniesOverview, type CompanyOverview, type CompanyCheckStatus } from '../api';

// Companies overview for Sona: pick an accountant, instantly see which of their
// companies are checked / not checked / need a recheck, with counters, search
// and per-company check history. One screen for accountant → company → result.

const REPORT_LABEL: Record<string, string> = { vat: 'НДС', turnover: 'Оборот', other: 'Другое' };

type StatusFilter = 'all' | CompanyCheckStatus;

const STATUS_META: Record<CompanyCheckStatus, { label: string; cls: string; dot: string }> = {
  needs_recheck: { label: 'Требует проверки', cls: 'st-recheck', dot: '🔴' },
  not_checked: { label: 'Не проверено', cls: 'st-none', dot: '⚪️' },
  checked: { label: 'Проверено', cls: 'st-checked', dot: '🟢' },
};

const pct = (v: number | null) => (v === null || v === undefined ? '—' : `${Math.round(Number(v) * 10) / 10}%`);
const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return day ? `${day}.${m}.${y}` : d;
};

interface CheckRow {
  id: string;
  checking_date: string | null;
  report_type: string | null;
  record_type: string | null;
  efficiency_pct: number | null;
  period: string | null;
  comment: string | null;
}

export function Companies() {
  const [data, setData] = useState<CompaniesOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [accountant, setAccountant] = useState(''); // '' = все бухгалтеры
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, CheckRow[] | 'loading'>>({});

  async function load() {
    setLoading(true);
    setErr('');
    try {
      setData(await api<CompaniesOverview>('/companies/meta/overview'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // Companies of the selected accountant (or all) — the base for counters.
  const byAcc = useMemo(() => {
    const all = data?.companies ?? [];
    return accountant ? all.filter((c) => (c.accountant ?? '') === accountant) : all;
  }, [data, accountant]);

  const counts = useMemo(() => ({
    total: byAcc.length,
    checked: byAcc.filter((c) => c.status === 'checked').length,
    not_checked: byAcc.filter((c) => c.status === 'not_checked').length,
    needs_recheck: byAcc.filter((c) => c.status === 'needs_recheck').length,
  }), [byAcc]);

  const visible = useMemo(() => {
    let rows = statusFilter === 'all' ? byAcc : byAcc.filter((c) => c.status === statusFilter);
    const s = q.trim().toLowerCase();
    if (s) {
      rows = rows.filter((c) =>
        c.name.toLowerCase().includes(s) ||
        (c.name_tax ?? '').toLowerCase().includes(s) ||
        c.agr_no.toLowerCase().includes(s) ||
        (c.accountant ?? '').toLowerCase().includes(s));
    }
    return rows;
  }, [byAcc, statusFilter, q]);

  async function toggle(c: CompanyOverview) {
    if (expanded === c.agr_no) { setExpanded(null); return; }
    setExpanded(c.agr_no);
    if (!checks[c.agr_no] && c.total_checks > 0) {
      setChecks((m) => ({ ...m, [c.agr_no]: 'loading' }));
      try {
        const r = await api<{ reviews: CheckRow[] }>(`/reviews?company=${encodeURIComponent(c.agr_no)}`);
        setChecks((m) => ({ ...m, [c.agr_no]: r.reviews ?? [] }));
      } catch {
        setChecks((m) => ({ ...m, [c.agr_no]: [] }));
      }
    }
  }

  const tiles: Array<{ key: StatusFilter; label: string; value: number; cls: string }> = [
    { key: 'all', label: 'Всего компаний', value: counts.total, cls: 't-total' },
    { key: 'checked', label: 'Проверено', value: counts.checked, cls: 't-checked' },
    { key: 'not_checked', label: 'Не проверено', value: counts.not_checked, cls: 't-none' },
    { key: 'needs_recheck', label: 'Требует проверки', value: counts.needs_recheck, cls: 't-recheck' },
  ];

  return (
    <div className="report">
      <div className="card">
        <div className="card-title">
          <h2>Компании</h2>
          <span className="muted small">{data ? `${data.companies.length} всего в базе` : ''}</span>
        </div>

        {/* Accountant + search */}
        <div className="co-filters">
          <label className="co-field">
            <span>Бухгалтер</span>
            <select value={accountant} onChange={(e) => { setAccountant(e.target.value); setExpanded(null); }}>
              <option value="">Все бухгалтеры</option>
              {(data?.accountants ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="co-field co-search">
            <span>Поиск компании</span>
            <input placeholder="Название, №, ИНН…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        {/* Counters — clickable filters */}
        <div className="co-tiles">
          {tiles.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`co-tile ${t.cls} ${statusFilter === t.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(t.key)}
            >
              <span className="co-tile-value">{t.value}</span>
              <span className="co-tile-label">{t.label}</span>
            </button>
          ))}
        </div>

        {err && <div className="muted small" style={{ color: 'var(--danger)' }}>{err}</div>}
        {loading && <div className="muted small">Загрузка…</div>}

        {!loading && (
          <div className="ticket-table-wrap">
            <table className="ticket-table co-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Компания</th>
                  <th>Бухгалтер</th>
                  <th>Статус</th>
                  <th>Посл. проверка</th>
                  <th>Оценка</th>
                  <th>Проверок</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const meta = STATUS_META[c.status];
                  const isOpen = expanded === c.agr_no;
                  const rowChecks = checks[c.agr_no];
                  return (
                    <Fragment key={c.agr_no}>
                      <tr className={`co-row ${c.status === 'needs_recheck' ? 'urgent-row' : ''}`} onClick={() => toggle(c)}>
                        <td><span className="ticket-caret">{isOpen ? '▾' : '▸'}</span></td>
                        <td>
                          <div className="co-name">{c.name}</div>
                          <div className="muted co-sub">
                            №{c.agr_no}
                            {c.company_status && c.company_status !== 'Active' ? ` · ${c.company_status === 'Inactive' ? 'неактивен' : c.company_status}` : ''}
                            {c.open_tickets > 0 ? ` · 🎫 ${c.open_tickets}` : ''}
                          </div>
                        </td>
                        <td>{c.accountant ?? '—'}</td>
                        <td><span className={`pill co-badge ${meta.cls}`}>{meta.label}</span></td>
                        <td>{fmtDate(c.last_check_date)}</td>
                        <td>{pct(c.last_score)}{c.last_points != null ? <span className="muted small"> · {c.last_points} б.</span> : null}</td>
                        <td>{c.total_checks}</td>
                      </tr>
                      {isOpen && (
                        <tr className="co-detail-row">
                          <td colSpan={7}>
                            {c.total_checks === 0 && <div className="muted small">Компания ещё не проверялась.</div>}
                            {rowChecks === 'loading' && <div className="muted small">Загрузка проверок…</div>}
                            {Array.isArray(rowChecks) && rowChecks.length > 0 && (
                              <table className="co-checks">
                                <thead>
                                  <tr>
                                    <th>Дата</th><th>Отчёт</th><th>Период</th><th>Оценка</th><th>Статус</th><th>Комментарий</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rowChecks.map((rv) => (
                                    <tr key={rv.id}>
                                      <td>{fmtDate(rv.checking_date)}</td>
                                      <td>{rv.report_type ? (REPORT_LABEL[rv.report_type] ?? rv.report_type) : '—'}</td>
                                      <td>{rv.period ?? '—'}</td>
                                      <td>{pct(rv.efficiency_pct)}</td>
                                      <td>{rv.record_type === 'problem'
                                        ? <span className="pill co-badge st-recheck">Проблема</span>
                                        : <span className="pill co-badge st-checked">ОК</span>}</td>
                                      <td className="co-comment">{rv.comment || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {visible.length === 0 && (
                  <tr><td colSpan={7} className="muted small" style={{ padding: '18px 12px' }}>Ничего не найдено.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
