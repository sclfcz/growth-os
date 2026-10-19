import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/server/auth';
import { getTogetherPartner, getTogetherPreferences, saveTogetherPreferences } from '@/server/together';

export const dynamic = 'force-dynamic';
const schema = z.object({ shareStudy: z.boolean(), shareActivity: z.boolean() }).strict();

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getSession(request, response);
  if (!session.authenticated || !session.username) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  const username = session.username;
  if (!getTogetherPartner(username)) return NextResponse.json({ error: { code: 'NOT_PAIRED', message: '当前账号尚未配对' } }, { status: 404 });
  return NextResponse.json(getTogetherPreferences(username));
}

export async function PUT(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getSession(request, response);
  if (!session.authenticated || !session.username) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  const username = session.username;
  if (!getTogetherPartner(username)) return NextResponse.json({ error: { code: 'NOT_PAIRED', message: '当前账号尚未配对' } }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '共享设置无效' } }, { status: 400 });
  saveTogetherPreferences(username, parsed.data);
  return NextResponse.json({ ok: true, ...parsed.data });
}
