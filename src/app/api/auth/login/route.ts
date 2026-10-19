import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getSession } from '@/server/auth';
import { apiError, sameOrigin } from '@/server/http';
const bodySchema = z.object({ username: z.string().trim().min(1).max(64).optional(), password: z.string().min(1).max(256) });
const attempts = new Map<string, { failures: number; lockedUntil: number }>();
export const dynamic='force-dynamic';
export async function POST(request: NextRequest) {
 if (!sameOrigin(request)) return apiError(403, 'INVALID_ORIGIN', '请求来源校验失败');
 const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
 const entry = attempts.get(ip) ?? { failures: 0, lockedUntil: 0 };
 if (entry.lockedUntil > Date.now()) return apiError(429, 'RATE_LIMITED', '尝试次数过多，请 15 分钟后再试');
 let body: unknown;
 try { body = await request.json(); } catch { return apiError(400, 'INVALID_JSON', '请求格式错误'); }
 const parsed = bodySchema.safeParse(body);
 if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', '请输入密码');
 let validUser: { username: string; role: 'admin' | 'user' } | undefined;
 const configuredUsers = process.env.APP_USERS_JSON;
 if (configuredUsers) {
  try {
   const users = z.array(z.object({ username: z.string().min(1).max(64), passwordHash: z.string().min(1), role: z.enum(['admin', 'user']) })).max(20).parse(JSON.parse(configuredUsers));
   const candidate = users.find(user => user.username === parsed.data.username);
   if (candidate && await bcrypt.compare(parsed.data.password, Buffer.from(candidate.passwordHash, 'base64').toString('utf8'))) validUser = { username: candidate.username, role: candidate.role };
  } catch { /* Invalid account configuration fails closed. */ }
 } else {
  const configuredHash=process.env.APP_PASSWORD_HASH;
  const decodedHash=configuredHash?Buffer.from(configuredHash,'base64').toString('utf8'):'';
  const hash=decodedHash.startsWith('$2')?decodedHash:configuredHash;
  if ((!parsed.data.username || parsed.data.username === 'admin') && hash && await bcrypt.compare(parsed.data.password, hash)) validUser = { username: parsed.data.username ?? 'admin', role: 'admin' };
 }
 const valid = Boolean(validUser);
 if (!valid) {
  entry.failures += 1;
  if (entry.failures >= 5) { entry.failures = 0; entry.lockedUntil = Date.now() + 15 * 60 * 1000; }
  attempts.set(ip, entry);
  return apiError(401, 'INVALID_CREDENTIALS', '密码不正确');
 }
 attempts.delete(ip);
 const response = NextResponse.json({ ok: true });
 const session = await getSession(request, response);
 session.authenticated = true;
 session.username = validUser!.username;
 session.role = validUser!.role;
 await session.save();
 return response;
}
