import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';
import { authRouter, bootstrapAdmin } from './auth.js';
import { companiesRouter } from './routes/companies.js';
import { reviewsRouter } from './routes/reviews.js';
import { ticketsRouter } from './routes/tickets.js';
import { reportsRouter } from './routes/reports.js';
import { accountantTasksRouter } from './routes/accountantTasks.js';
import { sonaTicketsDailyCronHandler } from './ticketsDaily.js';
import { startCron } from './cron.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/accountant-tasks', accountantTasksRouter);
// Daily Sona ticket-count Telegram report — entry point for Render Cron
// (guarded by CRON_SECRET when set; see ticketsDaily.ts).
app.get('/api/cron/sona-tickets-daily', sonaTicketsDailyCronHandler);
app.post('/api/cron/sona-tickets-daily', sonaTicketsDailyCronHandler);

// Serve the built client in production.
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

async function main() {
  await bootstrapAdmin();
  startCron();
  app.listen(env.port, () => console.log(`Sona QA server listening on :${env.port}`));
}

main().catch((e) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
