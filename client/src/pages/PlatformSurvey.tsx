import { useEffect, useState } from 'react';
import { api } from '../api';

// «Что улучшить в платформе» — a short survey Sona is nudged to fill once a day,
// after her 3rd check or in the evening. `PlatformSurveyGate` polls the server
// for whether to prompt (re-checking whenever `bump` changes — the check form
// increments it after each saved review) and shows the modal at most once a day.
// «Пропустить сегодня» stores a per-day dismissal in localStorage so we don't
// nag again the same day; the server also stops once an answer is submitted.

interface PromptState {
  shouldPrompt: boolean;
  checksToday: number;
  alreadySubmitted: boolean;
}

const dismissKey = (date: string) => `sqa_survey_dismissed_${date}`;
const today = () => new Date().toISOString().slice(0, 10);

export function PlatformSurveyGate({ bump }: { bump: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<PromptState & { date: string }>('/platform-feedback/prompt')
      .then((r) => {
        if (cancelled) return;
        const dismissed = localStorage.getItem(dismissKey(r.date)) === '1';
        if (r.shouldPrompt && !dismissed) setOpen(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [bump]);

  if (!open) return null;
  return <PlatformSurveyModal onClose={() => setOpen(false)} />;
}

const EASE = [1, 2, 3, 4, 5];

function PlatformSurveyModal({ onClose }: { onClose: () => void }) {
  const [ease, setEase] = useState<number | null>(null);
  const [slowed, setSlowed] = useState('');
  const [improvements, setImprovements] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const empty = ease == null && !slowed.trim() && !improvements.trim();

  async function submit() {
    if (empty) { setMsg({ kind: 'err', text: 'Ответьте хотя бы на один вопрос' }); return; }
    setBusy(true); setMsg(null);
    try {
      await api('/platform-feedback', {
        method: 'POST',
        body: JSON.stringify({
          ease_rating: ease,
          slowed_down: slowed.trim() || null,
          improvements: improvements.trim() || null,
        }),
      });
      setMsg({ kind: 'ok', text: 'Спасибо! Ответ сохранён.' });
      setTimeout(onClose, 900);
    } catch (err) {
      setMsg({ kind: 'err', text: 'Ошибка: ' + (err instanceof Error ? err.message : 'unknown') });
    } finally {
      setBusy(false);
    }
  }

  function skipToday() {
    localStorage.setItem(dismissKey(today()), '1');
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card card">
        <div className="card-title">
          <h2>Как улучшить платформу?</h2>
          <button type="button" className="btn-icon" aria-label="Закрыть" onClick={onClose}>✕</button>
        </div>
        <p className="muted small" style={{ marginTop: -4 }}>
          Короткий опрос по итогам проверок — 30 секунд. Ваши ответы помогают развивать платформу.
        </p>

        <label style={{ marginTop: 16 }}>Насколько удобно было работать сегодня?</label>
        <div className="ease-scale">
          {EASE.map((n) => (
            <button type="button" key={n}
              className={`ease-btn ${ease === n ? 'active' : ''}`}
              onClick={() => setEase(n)}>{n}</button>
          ))}
        </div>
        <div className="ease-legend muted small">
          <span>1 — неудобно</span><span>5 — отлично</span>
        </div>

        <label style={{ marginTop: 16, display: 'block' }}>Что замедляло работу сегодня?
          <textarea rows={2} value={slowed} placeholder="Необязательно"
            onChange={(e) => setSlowed(e.target.value)} />
        </label>
        <label style={{ marginTop: 12, display: 'block' }}>Что улучшить или чего не хватает?
          <textarea rows={3} value={improvements} placeholder="Необязательно"
            onChange={(e) => setImprovements(e.target.value)} />
        </label>

        {msg && <div className={msg.kind === 'ok' ? 'success' : 'error'} style={{ marginTop: 12 }}>{msg.text}</div>}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={skipToday}>Пропустить сегодня</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-soft" onClick={onClose}>Напомнить позже</button>
            <button type="button" className="btn-primary-sm" disabled={busy || empty} onClick={submit}>
              {busy ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
