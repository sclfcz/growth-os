import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { getPrimaryDatabasePath, runWithDatabaseUserContext } from '@/server/db/client';

const configuredPath = getPrimaryDatabasePath();
const sharedPath = join(dirname(configuredPath), 'together.db');
mkdirSync(dirname(sharedPath), { recursive: true });
const shared = new Database(sharedPath);
shared.pragma('journal_mode = WAL');
shared.pragma('foreign_keys = ON');
shared.exec(`
  CREATE TABLE IF NOT EXISTS together_preferences (
    username TEXT PRIMARY KEY,
    share_study INTEGER NOT NULL DEFAULT 0,
    share_activity INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS together_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    client_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(sender, client_id)
  );
  CREATE INDEX IF NOT EXISTS together_messages_conversation ON together_messages(conversation_id, id);
  CREATE TABLE IF NOT EXISTS together_reads (
    username TEXT PRIMARY KEY,
    last_read_id INTEGER NOT NULL DEFAULT 0
  );
`);

const userSchema = z.array(z.object({ username: z.string().min(1).max(64), role: z.enum(['admin', 'user']) })).max(20);
export type TogetherUser = { username: string; role: 'admin' | 'user' };
function configuredUsers() {
  try {
    return userSchema.parse(JSON.parse(process.env.APP_USERS_JSON ?? '[]'));
  } catch {
    return [];
  }
}

export function getTogetherPartner(username: string): TogetherUser | null {
  let pairs: string[][] = [];
  const rawPairs = process.env.TOGETHER_PAIRS_JSON;
  if (rawPairs) {
    try {
      pairs = z.array(z.array(z.string().min(1).max(64)).length(2)).max(20).parse(JSON.parse(rawPairs));
    } catch {
      return null;
    }
  }
  const partnerName = pairs.find(pair => pair.includes(username))?.find(name => name !== username);
  if (!partnerName) return null;
  const users = configuredUsers();
  const partner = users.find(user => user.username === partnerName);
  return partner ? { ...partner } : null;
}

export function getTogetherPreferences(username: string) {
  shared.prepare('INSERT OR IGNORE INTO together_preferences(username) VALUES (?)').run(username);
  const row = shared.prepare('SELECT share_study, share_activity FROM together_preferences WHERE username=?').get(username) as { share_study: number; share_activity: number };
  return { shareStudy: row.share_study === 1, shareActivity: row.share_activity === 1 };
}

export function saveTogetherPreferences(username: string, preferences: { shareStudy: boolean; shareActivity: boolean }) {
  shared.prepare(`INSERT INTO together_preferences(username,share_study,share_activity) VALUES (?,?,?)
    ON CONFLICT(username) DO UPDATE SET share_study=excluded.share_study, share_activity=excluded.share_activity`)
    .run(username, Number(preferences.shareStudy), Number(preferences.shareActivity));
}

export function getConversationId(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

export function getUnreadSummary(username: string, partner: string) {
  const row = shared.prepare('SELECT last_read_id FROM together_reads WHERE username=?').get(username) as { last_read_id: number } | undefined;
  const lastReadId = row?.last_read_id ?? 0;
  const conversationId = getConversationId(username, partner);
  const count = shared.prepare('SELECT COUNT(*) AS count FROM together_messages WHERE conversation_id=? AND recipient=? AND id>?')
    .get(conversationId, username, lastReadId) as { count: number };
  const latest = shared.prepare('SELECT id, sender, content, created_at AS createdAt FROM together_messages WHERE conversation_id=? AND recipient=? AND id>? ORDER BY id DESC LIMIT 1')
    .get(conversationId, username, lastReadId) as { id: number; sender: string; content: string; createdAt: string } | undefined;
  return { unreadCount: count.count, latestUnread: latest ?? null };
}

type StudyRow = { category: string; title: string | null; started_at: string; ended_at: string | null };
const unionSeconds = (intervals: { start: number; end: number }[]) => {
  intervals.sort((a, b) => a.start - b.start);
  let total = 0;
  let start: number | null = null;
  let end = 0;
  for (const interval of intervals) {
    if (start === null || interval.start > end) {
      if (start !== null) total += end - start;
      start = interval.start;
      end = interval.end;
    } else end = Math.max(end, interval.end);
  }
  if (start !== null) total += end - start;
  return Math.floor(total / 1000);
};

export function getPartnerStudyStatus(partner: TogetherUser, now = new Date()) {
  return runWithDatabaseUserContext(partner.username, partner.role, () => {
    const databasePath = partner.role === 'admin' ? configuredPath : join(dirname(configuredPath), 'users', `${partner.username.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}.db`);
    if (!existsSync(databasePath)) return { studySeconds: 0, activeActivity: null };
    const database = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const nowMs = now.getTime();
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const startOfDay = Date.parse(`${date}T00:00:00+08:00`);
      const rows = database.prepare('SELECT category,title,started_at,ended_at FROM study_time_logs').all() as StudyRow[];
      const intervals = rows.filter(row => row.category === 'study').map(row => ({
        start: Math.max(startOfDay, Date.parse(row.started_at)),
        end: Math.min(nowMs, row.ended_at ? Date.parse(row.ended_at) : nowMs),
      })).filter(row => row.end > row.start);
      const active = rows.filter(row => row.ended_at === null).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))[0];
      return {
        studySeconds: unionSeconds(intervals),
        activeActivity: active ? {
          category: active.category === 'study' ? '学习' : '工作',
          title: active.title ?? '正在进行',
          elapsedSeconds: Math.max(0, Math.floor((nowMs - Date.parse(active.started_at)) / 1000)),
        } : null,
      };
    } finally {
      database.close();
    }
  });
}

export function listConversationMessages(user: string, partner: string, beforeId?: number, limit = 50) {
  const conversationId = getConversationId(user, partner);
  const rows = beforeId
    ? shared.prepare('SELECT id,sender,recipient,content,created_at AS createdAt FROM together_messages WHERE conversation_id=? AND id<? ORDER BY id DESC LIMIT ?').all(conversationId, beforeId, limit)
    : shared.prepare('SELECT id,sender,recipient,content,created_at AS createdAt FROM together_messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?').all(conversationId, limit);
  return (rows as { id: number; sender: string; recipient: string; content: string; createdAt: string }[]).reverse();
}

export function createConversationMessage(user: string, partner: string, clientId: string, content: string) {
  const conversationId = getConversationId(user, partner);
  const createdAt = new Date().toISOString();
  shared.prepare('INSERT OR IGNORE INTO together_messages(conversation_id,sender,recipient,client_id,content,created_at) VALUES (?,?,?,?,?,?)')
    .run(conversationId, user, partner, clientId, content, createdAt);
  return shared.prepare('SELECT id,sender,recipient,content,created_at AS createdAt FROM together_messages WHERE sender=? AND client_id=?')
    .get(user, clientId) as { id: number; sender: string; recipient: string; content: string; createdAt: string };
}

export function markConversationRead(user: string, partner: string, lastReadId: number) {
  const conversationId = getConversationId(user, partner);
  const maxVisible = shared.prepare('SELECT MAX(id) AS id FROM together_messages WHERE conversation_id=? AND recipient=? AND id<=?')
    .get(conversationId, user, lastReadId) as { id: number | null };
  const safeId = maxVisible.id ?? 0;
  shared.prepare(`INSERT INTO together_reads(username,last_read_id) VALUES (?,?)
    ON CONFLICT(username) DO UPDATE SET last_read_id=MAX(last_read_id,excluded.last_read_id)`).run(user, safeId);
  return safeId;
}

export function getConversationUnreadCount(user: string, partner: string) {
  return getUnreadSummary(user, partner).unreadCount;
}
