import { useEffect, useState } from 'react';
import { getToken, clearToken } from './api';
import { Login } from './pages/Login';
import { SonaForm } from './pages/SonaForm';
import { SonaReport } from './pages/SonaReport';
import { Tickets } from './pages/Tickets';

type Tab = 'form' | 'report' | 'tickets';

export function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState<Tab>('form');

  useEffect(() => { setAuthed(Boolean(getToken())); }, []);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Sona QA · качество бухучёта</div>
        <nav className="tabs">
          <button className={tab === 'form' ? 'active' : ''} onClick={() => setTab('form')}>Форма Соны</button>
          <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Отчёт по работе Соны</button>
          <button className={tab === 'tickets' ? 'active' : ''} onClick={() => setTab('tickets')}>Тикеты</button>
        </nav>
        <button className="logout" onClick={() => { clearToken(); setAuthed(false); }}>Выйти</button>
      </header>
      <main className="content">
        {tab === 'form' && <SonaForm />}
        {tab === 'report' && <SonaReport />}
        {tab === 'tickets' && <Tickets />}
      </main>
    </div>
  );
}
