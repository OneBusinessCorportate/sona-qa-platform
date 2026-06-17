import { useState } from 'react';
import { api, setToken } from '../api';

export function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const { token } = await api<{ token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>Контроль качества</h1>
        <p className="muted">Проверка качества бухгалтерских услуг</p>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoFocus /></label>
        <label>Пароль<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" /></label>
        {error && <div className="error">{error}</div>}
        <button disabled={busy} type="submit">{busy ? 'Вход…' : 'Войти'}</button>
      </form>
    </div>
  );
}
