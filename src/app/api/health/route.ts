import { NextRequest, NextResponse } from 'next/server';
import { statSync } from 'node:fs';
import { getSession } from '@/server/auth';
import { getCurrentDatabasePath } from '@/server/db/client';
import { maybeDailyBackup } from '@/server/services/backup';
export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
 const response = NextResponse.json({ ok: true });
 const session = await getSession(request, response);
 if (!session.authenticated) return response;
 await maybeDailyBackup();
 if (session.authenticated) {
  let dbSize = 0;
  try { dbSize = statSync(getCurrentDatabasePath()).size; } catch { /* database has not been initialized yet */ }
  return NextResponse.json({ ok: true, version: process.env.npm_package_version ?? '0.1.0', dbSize });
 }
 return response;
}
