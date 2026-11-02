import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getSession } from '@/server/auth';
import { db } from '@/server/db/client';
import { journals } from '@/server/db/schema';
import { getLogicalDate } from '@/server/core/date';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gains: z.string().max(2000),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  if (!(await getSession(request, response)).authenticated) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '学习感悟无效' } }, { status: 400 });
  }

  const date = parsed.data.date ?? getLogicalDate();
  const existing = db.select().from(journals).where(eq(journals.date, date)).get();
  const journal = existing
    ? db.update(journals).set({ gains: parsed.data.gains }).where(eq(journals.date, date)).returning().get()
    : db.insert(journals).values({ date, gains: parsed.data.gains }).returning().get();

  return NextResponse.json({ date, gains: journal?.gains ?? '' });
}
