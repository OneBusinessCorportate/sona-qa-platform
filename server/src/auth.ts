import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from './supabase.js';
import { env } from './env.js';

export interface AuthedRequest extends Request {
  user?: { id: string; email: string; role: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthedRequest['user'];
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email_and_password_required' });

  const { data: user, error } = await supabase
    .from('sqa_users')
    .select('id, email, password_hash, name, role')
    .eq('email', String(email).toLowerCase())
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!user) return res.status(401).json({ error: 'invalid_credentials' });

  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, env.jwtSecret, {
    expiresIn: '30d',
  });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res: Response) => {
  res.json({ user: req.user });
});

// Create the first admin from env if the users table is empty (idempotent).
export async function bootstrapAdmin() {
  if (!env.adminEmail || !env.adminPassword) return;
  const { count } = await supabase.from('sqa_users').select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) return;
  const password_hash = await bcrypt.hash(env.adminPassword, 10);
  const { error } = await supabase.from('sqa_users').insert({
    email: env.adminEmail.toLowerCase(),
    password_hash,
    name: 'Admin',
    role: 'admin',
  });
  if (error) console.error('bootstrapAdmin failed:', error.message);
  else console.log(`Bootstrapped admin user: ${env.adminEmail}`);
}
