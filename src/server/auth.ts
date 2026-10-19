import { getIronSession, type SessionOptions } from 'iron-session';
import type { NextRequest, NextResponse } from 'next/server';
import { setDatabaseUserContext } from '@/server/db/client';
export type SessionData = { authenticated?: boolean; username?: string; role?: 'admin' | 'user' };
function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  return { password: secret, cookieName: 'growth_session', cookieOptions: { httpOnly: true, secure: process.env.COOKIE_SECURE!==undefined?process.env.COOKIE_SECURE==='true':process.env.NODE_ENV==='production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 } };
}
export async function getSession(request: NextRequest, response: NextResponse) {
  const session = await getIronSession<SessionData>(request, response, getSessionOptions());
  return new Proxy(session, {
    get(target, property) {
      if (property === 'authenticated' && target.authenticated) {
        setDatabaseUserContext(target.username ?? 'admin', target.role ?? 'admin');
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      const value = Reflect.get(target, property, target) as unknown;
      if (descriptor && descriptor.configurable === false &&
        (('value' in descriptor && descriptor.writable === false) || (!('value' in descriptor) && descriptor.get === undefined))) return value;
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target);
    },
  });
}
