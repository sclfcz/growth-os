import { db, sqlite } from './client';
import { decks, items } from './schema';
import seedData from '../../../seed/hot100.json';
const seed = seedData.items;
import { eq } from 'drizzle-orm';
const run = sqlite.transaction(() => {
 let deck = db.select().from(decks).all().find(row => row.name === 'LeetCode Hot 100');
 if (!deck) { const inserted = db.insert(decks).values({ name: 'LeetCode Hot 100', maxNewPerDay: 5, weight: 1, sortOrder: 0 }).returning().get(); deck = inserted; }
 if (!deck) throw new Error('无法创建种子卡组');
 for (const [index, row] of seed.entries()) {
  const item = row as { slug: string; title: string; url?: string; difficulty?: string; category?: string };
  if (!db.select({ id: items.id }).from(items).where(eq(items.slug, item.slug)).get()) db.insert(items).values({ deckId: deck.id, slug: item.slug, title: item.title, url: item.url ?? null, difficulty: item.difficulty ?? null, category: item.category ?? null, sortOrder: index }).run();
 }
});
run();
console.log('Hot 100 seed imported idempotently');
