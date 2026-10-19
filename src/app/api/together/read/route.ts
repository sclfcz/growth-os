import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/server/auth';
import { getTogetherPartner, markConversationRead } from '@/server/together';

export const dynamic = 'force-dynamic';
const schema = z.object({ lastReadId: z.number().int().positive() }).strict();

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getSession(request, response);
  if (!session.authenticated || !session.username) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  const username = session.username;
  const partner = getTogetherPartner(username);
  if (!partner) return NextResponse.json({ error: { code: 'NOT_PAIRED', message: '当前账号尚未配对' } }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '已读位置无效' } }, { status: 400 });
  return NextResponse.json({ ok: true, lastReadId: markConversationRead(username, partner.username, parsed.data.lastReadId) });
}
