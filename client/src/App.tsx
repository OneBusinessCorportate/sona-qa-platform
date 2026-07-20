import { useState } from 'react';
import { SonaForm } from './pages/SonaForm';
import { SonaReport } from './pages/SonaReport';
import { SonaTickets } from './pages/SonaTickets';
import { Companies } from './pages/Companies';
import { Efficiency } from './pages/Efficiency';
import { Tickets } from './pages/Tickets';
import { Answers } from './pages/Answers';
import { PlatformSurveyGate } from './pages/PlatformSurvey';

type Tab = 'form' | 'companies' | 'report' | 'sonatickets' | 'efficiency' | 'tickets' | 'answers';

export function App() {
  const [tab, setTab] = useState<Tab>('form');
  // Company handed off from the «Компании» tab to the check form.
  const [checkCompany, setCheckCompany] = useState('');
  // Bumped after each saved review so the survey gate re-checks whether the
  // 3rd-check-of-the-day threshold has just been reached.
  const [reviewBump, setReviewBump] = useState(0);

  function startCheck(agrNo: string) {
    setCheckCompany(agrNo);
    setTab('form');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">Контроль качества</div>
        <nav className="tabs">
          <button className={tab === 'form' ? 'active' : ''} onClick={() => setTab('form')}>Проверка</button>
          <button className={tab === 'companies' ? 'active' : ''} onClick={() => setTab('companies')}>Компании</button>
          <button className={tab === 'report' ? 'active' : ''} onClick={() => setTab('report')}>Отчёты</button>
          <button className={tab === 'sonatickets' ? 'active' : ''} onClick={() => setTab('sonatickets')}>Подсчёт тикетов</button>
          <button className={tab === 'efficiency' ? 'active' : ''} onClick={() => setTab('efficiency')}>Общая оценка</button>
          <button className={tab === 'tickets' ? 'active' : ''} onClick={() => setTab('tickets')}>Тикеты</button>
          <button className={tab === 'answers' ? 'active' : ''} onClick={() => setTab('answers')}>Ответы</button>
        </nav>
      </header>
      <main className={`content${tab === 'tickets' || tab === 'companies' ? ' content--wide' : ''}`}>
        <div style={tab !== 'form' ? { display: 'none' } : undefined}>
          <SonaForm
            presetCompany={checkCompany}
            onPresetConsumed={() => setCheckCompany('')}
            onReviewSaved={() => setReviewBump((n) => n + 1)}
          />
        </div>
        <div style={tab !== 'companies' ? { display: 'none' } : undefined}>
          <Companies active={tab === 'companies'} onCheck={startCheck} />
        </div>
        <div style={tab !== 'report' ? { display: 'none' } : undefined}><SonaReport /></div>
        <div style={tab !== 'sonatickets' ? { display: 'none' } : undefined}><SonaTickets /></div>
        <div style={tab !== 'efficiency' ? { display: 'none' } : undefined}><Efficiency /></div>
        <div style={tab !== 'tickets' ? { display: 'none' } : undefined}><Tickets /></div>
        <div style={tab !== 'answers' ? { display: 'none' } : undefined}><Answers /></div>
      </main>
      <PlatformSurveyGate bump={reviewBump} />
    </div>
  );
}
