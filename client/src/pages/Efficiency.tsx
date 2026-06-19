import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

// "Общая оценка" — взвешенный скоринг бухгалтеров (Итог Q) за период.
// К1..К5 считаются автоматически из ежедневных проверок; Сона может
// переопределить любое значение (одно заполнение → отчёт формируется сам).

interface Criteria { k1: number; k2: number; k3: number; k4: number; k5: number }
interface Row extends Criteria {
  accountant: string; reviews: number; auto: Criteria; itogQ: number; level: string; overridden: boolean;
}
interface Scorecard { from: string; to: string; rows: Row[] }

const KEYS: Array<{ id: keyof Criteria; label: string; weight: string }> = [
  { id: 'k1', label: 'К1 ошибки', weight: '0.1' },
  { id: 'k2', label: 'К2 сроки', weight: '0.3' },
  { id: 'k3', label: 'К3 отчётность', weight: '0.2' },
  { id: 'k4', label: 'К4 документы', weight: '0.3' },
  { id: 'k5', label: 'К5 доработки', weight: '0.1' },
];

const monthStart = () => new Date().toISOString().slice(0, 8) + '01';
const today = () => new Date().toISOString().slice(0, 10);
const levelClass = (q: number) => (q >= 90 ? 'band-5' : q >= 70 ? 'band-4' : q >= 50 ? 'band-3' : 'band-2');

export function Efficiency() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<Scorecard | null>(null);
  // Local edits keyed by accountant → { k1.. : string }.
  const [edits, setEdits] = useState<Record<string, Partial<Record<keyof Criteria, string>>>>({});
  const [msg, setMsg] = useState('');

  async function load() {
    setEdits({});
    setData(await api<Scorecard>(`/reports/scorecard?from=${from}&to=${to}`));
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  // Effective value shown in a cell: local edit → merged value from server.
  const cellValue = (r: Row, id: keyof Criteria) => edits[r.accountant]?.[id] ?? String(r[id]);
  const setCell = (acc: string, id: keyof Criteria, v: string) =>
    setEdits((e) => ({ ...e, [acc]: { ...e[acc], [id]: v.replace(/[^\d.]/g, '') } }));

  // Live Итог Q preview from the currently shown cell values.
  const previewQ = (r: Row) => {
    const w: Record<keyof Criteria, number> = { k1: 0.1, k2: 0.3, k3: 0.2, k4: 0.3, k5: 0.1 };
    return Math.round(KEYS.reduce((s, k) => s + (Number(cellValue(r, k.id)) || 0) * w[k.id], 0));
  };

  async function save(r: Row) {
    setMsg('Сохранение…');
    // Send the shown value as an override only when it differs from the
    // auto-derived baseline; matching auto clears the override (→ null).
    const body: any = { accountant: r.accountant, from, to };
    for (const k of KEYS) {
      const shown = Number(cellValue(r, k.id));
      body[k.id] = shown === r.auto[k.id] ? null : shown;
    }
    try {
      await api('/reports/scorecard/override', { method: 'PUT', body: JSON.stringify(body) });
      setMsg('✓ Сохранено');
      load();
    } catch (e) {
      setMsg('Ошибка: ' + (e instanceof Error ? e.message : 'unknown'));
    }
  }

  const dirty = useMemo(() => {
    const d = new Set<string>();
    for (const r of data?.rows ?? []) {
      if (KEYS.some((k) => cellValue(r, k.id) !== String(r[k.id]))) d.add(r.accountant);
    }
    return d;
  }, [data, edits]);

  return (
    <div className="report">
      <div className="card">
        <div className="report-head">
          <h2>Общая оценка</h2>
          <label className="small">с <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="small">по <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <p className="muted small">
          Итог Q = 0.1·К1 + 0.3·К2 + 0.2·К3 + 0.3·К4 + 0.1·К5. Значения К1–К5 (0–100)
          считаются из проверок за период; их можно переопределить вручную.
        </p>

        <div className="scorecard-wrap">
          <table className="scorecard">
            <thead>
              <tr>
                <th>Бухгалтер</th>
                <th>Пров.</th>
                {KEYS.map((k) => <th key={k.id} title={`вес ${k.weight}`}>{k.label}</th>)}
                <th>Итог Q</th>
                <th>Уровень</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => {
                const q = previewQ(r);
                return (
                  <tr key={r.accountant}>
                    <td>{r.accountant}{r.overridden && <span className="muted small" title="есть ручные правки"> ✎</span>}</td>
                    <td>{r.reviews}</td>
                    {KEYS.map((k) => {
                      const edited = cellValue(r, k.id) !== String(r.auto[k.id]);
                      return (
                        <td key={k.id}>
                          <input className={`k-input ${edited ? 'k-edited' : ''}`} inputMode="numeric"
                            value={cellValue(r, k.id)} onChange={(e) => setCell(r.accountant, k.id, e.target.value)}
                            title={`авто: ${r.auto[k.id]}`} />
                        </td>
                      );
                    })}
                    <td><span className={`overall-badge ${levelClass(q)}`}>{q}</span></td>
                    <td className="small">{r.level}</td>
                    <td>
                      {dirty.has(r.accountant) && <button className="btn-soft" onClick={() => save(r)}>Сохранить</button>}
                    </td>
                  </tr>
                );
              })}
              {data && data.rows.length === 0 && <tr><td colSpan={10} className="muted">Нет проверок за период</td></tr>}
            </tbody>
          </table>
        </div>
        {msg && <div className={msg.startsWith('✓') ? 'success' : 'muted'} style={{ marginTop: 10 }}>{msg}</div>}
      </div>
    </div>
  );
}
