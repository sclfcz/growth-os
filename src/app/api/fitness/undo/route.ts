import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, sqlite } from '@/server/db/client';
import { workouts, workoutSets } from '@/server/db/schema';
import { getSession } from '@/server/auth';
import { getLogicalDate } from '@/server/core/date';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  if (!(await getSession(request, response)).authenticated) {
    return NextResponse.json({ error: { message: '请先登录' } }, { status: 401 });
  }

  const parsed = z.object({ setId: z.number().int().positive() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { message: '训练组记录无效' } }, { status: 400 });

  const set = db.select().from(workoutSets).where(eq(workoutSets.id, parsed.data.setId)).get();
  if (!set) return NextResponse.json({ error: { message: '这组训练记录不存在' } }, { status: 404 });
  const workout = db.select().from(workouts).where(eq(workouts.id, set.workoutId)).get();
  if (!workout || workout.date !== getLogicalDate() || workout.status !== 'done') {
    return NextResponse.json({ error: { message: '只能撤回今天的训练组' } }, { status: 404 });
  }

  sqlite.transaction(() => {
    db.delete(workoutSets).where(eq(workoutSets.id, set.id)).run();
    const remainingSets = db.select().from(workoutSets).all().some(row => row.workoutId === workout.id);
    if (!remainingSets) db.delete(workouts).where(eq(workouts.id, workout.id)).run();
  })();

  return NextResponse.json({ ok: true });
}
