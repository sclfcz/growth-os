import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/server/auth';
import { createConversationMessage, getConversationUnreadCount, getTogetherPartner, listConversationMessages } from '@/server/together';

export const dynamic = 'force-dynamic';
const postSchema = z.object({ clientId: z.string().trim().min(1).max(80), content: z.string().trim().min(1).max(2000) }).strict();

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getSession(request, response);
  if (!session.authenticated || !session.username) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  const username = session.username;
  const partner = getTogetherPartner(username);
  if (!partner) return NextResponse.json({ error: { code: 'NOT_PAIRED', message: '当前账号尚未配对' } }, { status: 404 });
  const beforeRaw = request.nextUrl.searchParams.get('beforeId');
  const beforeId = beforeRaw === null ? undefined : Number(beforeRaw);
  if (beforeRaw !== null && (!Number.isSafeInteger(beforeId) || (beforeId ?? 0) < 1)) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '消息游标无效' } }, { status: 400 });
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limit = limitRaw === null ? 50 : Number(limitRaw);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '消息数量无效' } }, { status: 400 });
  return NextResponse.json({ messages: listConversationMessages(username, partner.username, beforeId, limit), unreadCount: getConversationUnreadCount(username, partner.username) });
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getSession(request, response);
  if (!session.authenticated || !session.username) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  const username = session.username;
  const partner = getTogetherPartner(username);
  if (!partner) return NextResponse.json({ error: { code: 'NOT_PAIRED', message: '当前账号尚未配对' } }, { status: 404 });
  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '留言不能为空，且不能超过 2000 字' } }, { status: 400 });
  const message = createConversationMessage(username, partner.username, parsed.data.clientId, parsed.data.content);
  return NextResponse.json({ message }, { status: 201 });
}
