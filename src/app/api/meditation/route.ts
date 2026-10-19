import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { meditationSessions } from '@/server/db/schema';
import { getSession } from '@/server/auth';
import { apiError, sameOrigin } from '@/server/http';
import { getLogicalDate } from '@/server/core/date';

export const dynamic = 'force-dynamic';

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), minutes: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal('complete'), id: z.number().int().positive() }),
  z.object({ action: z.literal('cancel'), id: z.number().int().positive() }),
]);

const sessionWithEnd = (session: typeof meditationSessions.$inferSelect) => ({
  ...session,
  endsAt: new Date(Date.parse(session.startedAt) + session.durationMinutes * 60_000).toISOString(),
});

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  if (!(await getSession(request, response)).authenticated) return apiError(401, 'UNAUTHORIZED', '请先登录');

  const date = getLogicalDate();
  const sessions = db.select().from(meditationSessions).all();
  const active = sessions.filter(session => session.completedAt === null).sort((a, b) => b.id - a.id)[0] ?? null;
  const completedCount = sessions.filter(session => session.date === date && session.completedAt !== null).length;
  return NextResponse.json({ date, count: completedCount, target: 1, activeSession: active ? sessionWithEnd(active) : null });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return apiError(403, 'INVALID_ORIGIN', '请求来源校验失败');
  const response = NextResponse.next();
  if (!(await getSession(request, response)).authenticated) return apiError(401, 'UNAUTHORIZED', '请先登录');

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'VALIDATION_ERROR', '冥想操作无效，请检查时长。');
  const action = parsed.data;

  const sessions = db.select().from(meditationSessions).all();
  if (action.action === 'start') {
    const active = sessions.find(session => session.completedAt === null);
    if (active) return apiError(409, 'SESSION_ACTIVE', '已有一段冥想正在进行。');
    const session = db.insert(meditationSessions).values({
      date: getLogicalDate(),
      durationMinutes: action.minutes,
      startedAt: new Date().toISOString(),
    }).returning().get();
    return NextResponse.json({ session: sessionWithEnd(session) }, { status: 201 });
  }

  const session = sessions.find(row => row.id === action.id && row.completedAt === null);
  if (!session) return apiError(404, 'NOT_FOUND', '这段冥想不存在或已结束。');

  if (action.action === 'cancel') {
    db.delete(meditationSessions).where(eq(meditationSessions.id, session.id)).run();
    return NextResponse.json({ ok: true });
  }

  const expectedEnd = Date.parse(session.startedAt) + session.durationMinutes * 60_000;
  const now = Date.now();
  if (now + 1_000 < expectedEnd) return apiError(409, 'NOT_FINISHED', '冥想时间还未结束。');
  db.update(meditationSessions).set({ date: getLogicalDate(), completedAt: new Date(now).toISOString() }).where(eq(meditationSessions.id, session.id)).run();
  const count = db.select().from(meditationSessions).all().filter(row => row.date === getLogicalDate() && row.completedAt !== null).length;
  return NextResponse.json({ ok: true, count });
}
