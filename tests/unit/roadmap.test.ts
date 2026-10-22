import { describe, expect, it } from 'vitest';
import { buildFirstPassRoadmap } from '@/server/core/roadmap';

const newItems = (count: number) => Array.from({ length: count }, (_, id) => ({ id: id + 100, title: `新题 ${id + 1}`, difficulty: 'medium' }));

describe('FSRS 首刷路线图', () => {
  it('复习轻时每天安排两道新题', () => {
    const days = buildFirstPassRoadmap({ firstDate: '2026-10-23', remainingNewItems: newItems(5), dueReviews: [], dailyQuestionLimit: 4 });
    expect(days.map(day => day.newItems.length)).toEqual([2, 2, 1]);
    expect(days.every(day => day.reviews.length + day.newItems.length <= 4)).toBe(true);
  });

  it('到期复习达到三道时安排三复习加一道新题', () => {
    const reviews = [1, 2, 3].map(id => ({ id, title: `复习题 ${id}`, difficulty: 'medium', dueDate: '2026-10-23' }));
    const days = buildFirstPassRoadmap({ firstDate: '2026-10-23', remainingNewItems: newItems(2), dueReviews: reviews, dailyQuestionLimit: 4 });
    expect(days[0]).toMatchObject({ reviews, newItems: [newItems(2)[0]] });
    expect(days[0].reviews.length + days[0].newItems.length).toBe(4);
  });
});
