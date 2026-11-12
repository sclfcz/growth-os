import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { decks, items, settings } from '@/server/db/schema';
import { getSession } from '@/server/auth';
import { addDays, getLogicalDate } from '@/server/core/date';
import { buildFirstPassRoadmap } from '@/server/core/roadmap';

export const dynamic = 'force-dynamic';
const settingValue = (key: string, fallback: number) => {
  const row = db.select().from(settings).all().find(value => value.key === key);
  return row ? Number(JSON.parse(row.value)) : fallback;
};

export async function GET(req: NextRequest) {
  const response = NextResponse.next();
  if (!(await getSession(req, response)).authenticated) return NextResponse.json({ error: { message: '请先登录' } }, { status: 401 });
  const deckRows = db.select().from(decks).all();
  const deckIds = new Set(deckRows.filter(deck => /leetcode|力扣|hot\s*100/i.test(deck.name)).map(deck => deck.id));
  const leetcodeItems = db.select().from(items).all().filter(item => deckIds.has(item.deckId));
  const remaining = leetcodeItems.filter(item => item.status === 'new').sort((a, b) => a.sortOrder - b.sortOrder);
  const dailyLimit = settingValue('daily_leetcode_limit', 4);
  const firstDate = addDays(getLogicalDate(), 1);
  const dailyPlanLimit = Math.min(2, dailyLimit);
  const days = buildFirstPassRoadmap({
    firstDate,
    remainingNewItems: remaining.map(item => ({ id: item.id, title: item.title, difficulty: item.difficulty })),
    dueReviews: leetcodeItems.filter(item => item.status !== 'new' && item.dueDate !== null).map(item => ({ id: item.id, title: item.title, difficulty: item.difficulty, dueDate: item.dueDate as string })),
    dailyQuestionLimit: dailyLimit,
    maxNewPerDay: dailyPlanLimit,
  });
  return NextResponse.json({ firstDate, dailyLimit, dailyNewLimit: dailyPlanLimit, remainingCount: remaining.length, days, estimatedFinishDate: days.at(-1)?.date ?? null });
}
