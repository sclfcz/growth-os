import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { decks, items, settings } from '@/server/db/schema';
import { getSession } from '@/server/auth';
import { addDays, getLogicalDate } from '@/server/core/date';

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
  const remaining = db.select().from(items).all().filter(item => deckIds.has(item.deckId) && item.status === 'new').sort((a, b) => a.sortOrder - b.sortOrder);
  const dailyLimit = settingValue('daily_leetcode_limit', 4);
  const firstDate = addDays(getLogicalDate(), 1);
  const days = Array.from({ length: Math.ceil(remaining.length / dailyLimit) }, (_, index) => ({
    date: addDays(firstDate, index),
    items: remaining.slice(index * dailyLimit, (index + 1) * dailyLimit).map(item => ({ id: item.id, title: item.title, difficulty: item.difficulty })),
  }));
  return NextResponse.json({ firstDate, dailyLimit, remainingCount: remaining.length, days, estimatedFinishDate: days.at(-1)?.date ?? null });
}
