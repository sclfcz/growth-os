import { addDays, dateDistance, getLogicalDate, logicalDateTime } from './date';
import { createEmptyCard, fsrs, Rating as FsrsRating } from 'ts-fsrs';
export const LADDER = [1, 3, 7, 14, 30, 60, 120] as const;
export type Rating = 'again' | 'hard' | 'good';
export type ItemState = { stage: number; dueDate: string | null; status: string; lapses: number; lastRating?: Rating | null };
export type ScheduleResult = ItemState & { interval: number; dueDate: string };
export type ReviewHistoryEntry = { date: string; rating: Rating; createdAt: string };
export function deriveStatus(stage: number, lapses: number, lastRating: Rating | null = null): string {
  if (lapses >= 3) return 'leech';
  if (stage >= 4 && lastRating === 'good') return 'mastered';
  if (stage >= 2) return 'reviewing';
  return 'learning';
}
export function loadBalance(target: string, interval: number, dueCounts: Readonly<Record<string, number>>, fuzz = Math.round(interval * 0.15)): string {
  if (interval < 7 || fuzz <= 0) return target;
  let best = target;
  for (let offset = -fuzz; offset <= fuzz; offset += 1) {
    const candidate = addDays(target, offset);
    if ((dueCounts[candidate] ?? 0) < (dueCounts[best] ?? 0)) best = candidate;
  }
  return best;
}
export function applyRating(item: ItemState, rating: Rating, today: string, maxIntervalDays = 30, history: ReviewHistoryEntry[] = []): ScheduleResult {
  let stage = item.stage;
  let lapses = item.lapses;
  if (item.status === 'new') stage = rating === 'again' ? 0 : rating === 'hard' ? 1 : 2;
  else if (rating === 'good') stage = Math.min(stage + 1, 6);
  else if (rating === 'hard') stage = stage === 0 ? 1 : stage;
  else { stage = Math.max(stage - 2, 0); lapses += 1; }
  // FSRS 5 with 90% desired retention. Replaying this item's saved ratings lets
  // existing review history seed FSRS without rewriting any due dates in advance.
  const scheduler = fsrs({ request_retention: 0.9, maximum_interval: maxIntervalDays, enable_fuzz: false, enable_short_term: false, learning_steps: [], relearning_steps: [] });
  const toReviewDate = (date: string) => new Date(logicalDateTime(date, '12:00'));
  let card = createEmptyCard(toReviewDate(history[0]?.date ?? today));
  const fsrsRating = (value: Rating) => value === 'again' ? FsrsRating.Again : value === 'hard' ? FsrsRating.Hard : FsrsRating.Good;
  for (const previous of [...history].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))) {
    card = scheduler.next(card, toReviewDate(previous.date), fsrsRating(previous.rating)).card;
  }
  const scheduled = scheduler.next(card, toReviewDate(today), fsrsRating(rating)).card;
  const scheduledDueDate = getLogicalDate(scheduled.due);
  const interval = Math.max(1, Math.min(maxIntervalDays, dateDistance(today, scheduledDueDate)));
  const dueDate = interval < dateDistance(today, scheduledDueDate) ? addDays(today, interval) : scheduledDueDate;
  return { stage, lapses, interval, dueDate, status: deriveStatus(stage, lapses, rating), lastRating: rating };
}
export function undoRating<T extends ItemState>(snapshot: T): T { return { ...snapshot }; }
/** Distribute initial onboard reviews evenly across the specification's day 4–12 window. */
export function spreadOnboardDueDates(count: number, today: string, windowDays = 9): string[] {
  const total = Math.max(0, Math.floor(count));
  return Array.from({ length: total }, (_, index) => addDays(today, 4 + (index % windowDays)));
}
export function onboardDueOffset(index: number, rating: Rating): number {
  const position=Math.max(0,Math.floor(index));
  if(rating==='again')return 1+(position%3);
  if(rating==='hard')return 2+(position%5);
  return 4+(position%9);
}
