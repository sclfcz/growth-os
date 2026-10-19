import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { studyTimeLogs } from '@/server/db/schema';
import { getSession } from '@/server/auth';
import { addDays, getLogicalDate, logicalDateTime } from '@/server/core/date';

export const dynamic = 'force-dynamic';
const monday = (date: string) => { const day = new Date(`${date}T12:00:00+08:00`).getDay(); return addDays(date, -(day + 6) % 7); };
const secondsBetween = (start: string, end: string) => Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 1000));
const secondsFor = (row: typeof studyTimeLogs.$inferSelect, now = Date.now()) => row.endedAt
  ? row.durationSeconds ?? (row.durationMinutes !== null ? row.durationMinutes * 60 : secondsBetween(row.startedAt, row.endedAt))
  : Math.max(0, Math.floor((now - Date.parse(row.startedAt)) / 1000));

function summarize(rows: (typeof studyTimeLogs.$inferSelect)[], now: number) {
  const intervals = rows.map(row => ({ start: Date.parse(row.startedAt), end: row.endedAt ? Date.parse(row.endedAt) : now, category: row.category, seconds: secondsFor(row, now) })).filter(row => row.end > row.start).sort((a, b) => a.start - b.start);
  const unionMilliseconds = (source: typeof intervals) => {
    let total = 0; let start = 0; let end = 0;
    for (const interval of source) {
      if (interval.start > end) { total += Math.max(0, end - start); start = interval.start; end = interval.end; }
      else end = Math.max(end, interval.end);
    }
    if (source.length) total += Math.max(0, end - start);
    return total;
  };
  const totalSeconds = Math.floor(unionMilliseconds(intervals) / 1000);
  const workSeconds = Math.floor(unionMilliseconds(intervals.filter(row => row.category === 'work')) / 1000);
  const studySeconds = Math.floor(unionMilliseconds(intervals.filter(row => row.category === 'study')) / 1000);
  return { totalSeconds, workSeconds, studySeconds, parallelSeconds: Math.max(0, workSeconds + studySeconds - totalSeconds) };
}

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  if (!(await getSession(req, res)).authenticated) return NextResponse.json({ error: { message: '请先登录' } }, { status: 401 });
  const date = getLogicalDate(); const now = Date.now(); const rows = db.select().from(studyTimeLogs).all();
  const activeLogs = rows.filter(row => row.endedAt === null).sort((a, b) => a.id - b.id).map(row => ({ ...row, elapsedSeconds: secondsFor(row, now) }));
  const completed = [...rows].filter(row => row.endedAt !== null).sort((a, b) => b.id - a.id);
  const todayRows = rows.filter(row => row.date === date);
  const weekRows = rows.filter(row => row.date >= monday(date) && row.date <= date);
  const monthRows = rows.filter(row => row.date.startsWith(date.slice(0, 7)));
  const recentLogs = completed.slice(0, 10).map(row => ({ ...row, durationSeconds: secondsFor(row, now) }));
  return NextResponse.json({ activeLogs, recentLogs, today: summarize(todayRows, now), weekSeconds: summarize(weekRows, now).totalSeconds, monthSeconds: summarize(monthRows, now).totalSeconds });
}

export async function POST(req: NextRequest) {
  const res = NextResponse.next();
  if (!(await getSession(req, res)).authenticated) return NextResponse.json({ error: { message: '请先登录' } }, { status: 401 });
  const action = z.discriminatedUnion('action', [
    z.object({ action: z.literal('start'), category: z.enum(['work', 'study']), title: z.string().min(1).max(100), subtitle: z.string().max(160).optional() }),
    z.object({ action: z.literal('stop'), id: z.number().int().positive() }),
    z.object({ action: z.literal('manual'), category: z.enum(['work', 'study']), title: z.string().trim().min(1).max(100), subtitle: z.string().max(160).optional(), minutes: z.number().int().min(1).max(1440).optional(), startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(), endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional() }),
  ]).safeParse(await req.json().catch(() => null));
  if (!action.success) return NextResponse.json({ error: { message: '时长记录无效，请填写事项和类别。' } }, { status: 400 });
  const rows = db.select().from(studyTimeLogs).all();
  if (action.data.action === 'start') {
    const category = action.data.category;
    if (rows.some(row => row.endedAt === null && row.category === category)) return NextResponse.json({ error: { message: '这一类别已有计时，请先结束当前计时。' } }, { status: 409 });
    const row = db.insert(studyTimeLogs).values({ date: getLogicalDate(), category, title: action.data.title, subtitle: action.data.subtitle ?? null, startedAt: new Date().toISOString(), note: null }).returning().get();
    return NextResponse.json({ log: row }, { status: 201 });
  }
  if (action.data.action === 'stop') {
    const id = action.data.id;
    const active = rows.find(row => row.id === id && row.endedAt === null);
    if (!active) return NextResponse.json({ error: { message: '这段计时已经结束或不存在。' } }, { status: 404 });
    const endedAt = new Date().toISOString(); const durationSeconds = secondsBetween(active.startedAt, endedAt);
    const row = db.update(studyTimeLogs).set({ endedAt, durationSeconds, durationMinutes: Math.floor(durationSeconds / 60) }).where(eq(studyTimeLogs.id, active.id)).returning().get();
    return NextResponse.json({ log: row });
  }
  const date = getLogicalDate();
  const useDuration = action.data.minutes !== undefined;
  const useRange = Boolean(action.data.startTime && action.data.endTime);
  if (useDuration === useRange || Boolean(action.data.startTime) !== Boolean(action.data.endTime)) {
    return NextResponse.json({ error: { message: '请选择补记时长或起止时间其中一种方式，并填写完整。' } }, { status: 400 });
  }
  const endedAt = useDuration ? new Date().toISOString() : logicalDateTime(date, action.data.endTime!);
  const startedAt = useDuration
    ? new Date(Date.parse(endedAt) - action.data.minutes! * 60_000).toISOString()
    : logicalDateTime(date, action.data.startTime!);
  const durationSeconds = secondsBetween(startedAt, endedAt);
  if (durationSeconds <= 0 || durationSeconds > 24 * 60 * 60) return NextResponse.json({ error: { message: '补记结束时间必须晚于开始时间，且时长不能超过 24 小时。' } }, { status: 400 });
  const row = db.insert(studyTimeLogs).values({ date, category: action.data.category, title: action.data.title, subtitle: action.data.subtitle ?? null, startedAt, endedAt, durationSeconds, durationMinutes: Math.floor(durationSeconds / 60), note: '手动记录' }).returning().get();
  return NextResponse.json({ log: row }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.next();
  if (!(await getSession(req, res)).authenticated) return NextResponse.json({ error: { message: '请先登录' } }, { status: 401 });
  const parsed = z.object({ id: z.number().int().positive() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { message: '时长记录无效' } }, { status: 400 });
  const row = db.select().from(studyTimeLogs).where(eq(studyTimeLogs.id, parsed.data.id)).get();
  if (!row || row.endedAt === null) return NextResponse.json({ error: { message: '只能撤回已经结束的时长记录' } }, { status: 404 });
  db.delete(studyTimeLogs).where(eq(studyTimeLogs.id, row.id)).run();
  return NextResponse.json({ ok: true });
}
