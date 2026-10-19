import { AsyncLocalStorage } from 'node:async_hooks';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

type Sqlite = InstanceType<typeof Database>;
type TenantClient = { sqlite: Sqlite; db: ReturnType<typeof drizzle> };

export function getPrimaryDatabasePath() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return join(tmpdir(), `growth-os-build-${process.pid}`, 'growth.db');
  return process.env.DATABASE_PATH ?? './data/growth.db';
}

const primaryDatabasePath = getPrimaryDatabasePath();
const databaseUser = new AsyncLocalStorage<string>();
const clients = new Map<string, TenantClient>();

function seedDefaults(sqlite: Sqlite) {
  const seedPath = resolve(process.cwd(), 'seed/hot100.json');
  if (!existsSync(seedPath)) throw new Error(`Hot100 seed file is missing: ${seedPath}`);
  const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as {
    deck: string;
    items: { slug: string; title: string; url?: string; difficulty?: string; category?: string; order: number }[];
  };
  const deck = sqlite.prepare('SELECT id FROM decks WHERE name=?').get(seed.deck) as { id: number } | undefined;
  const deckId = deck?.id ?? Number(sqlite.prepare('INSERT INTO decks(name,sort_order,max_new_per_day,weight) VALUES (?,0,5,1)').run(seed.deck).lastInsertRowid);
  const insertItem = sqlite.prepare("INSERT OR IGNORE INTO items(deck_id,slug,title,url,difficulty,category,sort_order,status,stage,lapses) VALUES (?,?,?,?,?,?,?,'new',0,0)");
  for (const item of seed.items) insertItem.run(deckId, item.slug, item.title, item.url ?? null, item.difficulty ?? null, item.category ?? null, item.order - 1);

  const categories: [string, string, string[]][] = [
    ['餐饮','expense',['饭','餐','奶茶']],['交通','expense',['地铁','打车','公交']],['学习与工具','expense',['书','课','api','token','服务器']],
    ['日用','expense',['日用','超市']],['娱乐','expense',['电影','游戏']],['恋爱社交','expense',['礼物','聚餐']],['健身','expense',['健身','训练']],
    ['医疗','expense',['医院','药']],['其他','expense',[]],['稿费 / 公众号','income',['稿费','公众号']],['工资','income',['工资']],
    ['生活费','income',['生活费']],['其他收入','income',[]],
  ];
  const insertCategory = sqlite.prepare('INSERT INTO expense_categories(name,kind,keywords,sort_order) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name=?)');
  categories.forEach(([name, kind, keywords], index) => insertCategory.run(name, kind, JSON.stringify(keywords), index, name));
}

function initializeDatabase(sqlite: Sqlite) {
  const migrationPath = resolve(process.cwd(), 'drizzle/0000_init.sql');
  sqlite.exec(readFileSync(migrationPath, 'utf8'));
  const taskColumns = sqlite.prepare('PRAGMA table_info(tasks)').all() as { name: string }[];
  if (!taskColumns.some(column => column.name === 'priority')) sqlite.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'important'");
  sqlite.exec("CREATE TABLE IF NOT EXISTS study_time_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'study', title TEXT, subtitle TEXT, started_at TEXT NOT NULL, ended_at TEXT, duration_seconds INTEGER, duration_minutes INTEGER, note TEXT)");
  const studyColumns = sqlite.prepare('PRAGMA table_info(study_time_logs)').all() as { name: string }[];
  if (!studyColumns.some(column => column.name === 'duration_seconds')) sqlite.exec('ALTER TABLE study_time_logs ADD COLUMN duration_seconds INTEGER');
  if (!studyColumns.some(column => column.name === 'category')) sqlite.exec("ALTER TABLE study_time_logs ADD COLUMN category TEXT NOT NULL DEFAULT 'study'");
  if (!studyColumns.some(column => column.name === 'title')) sqlite.exec('ALTER TABLE study_time_logs ADD COLUMN title TEXT');
  if (!studyColumns.some(column => column.name === 'subtitle')) sqlite.exec('ALTER TABLE study_time_logs ADD COLUMN subtitle TEXT');
  sqlite.prepare('INSERT OR IGNORE INTO __drizzle_migrations(name) VALUES (?)').run('0000_init');
  seedDefaults(sqlite);
}

function openDatabase(path: string): TenantClient {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  initializeDatabase(sqlite);
  return { sqlite, db: drizzle(sqlite) };
}

const primaryClient = openDatabase(primaryDatabasePath);
clients.set('admin', primaryClient);

function currentUserKey() {
  return databaseUser.getStore() ?? 'admin';
}

function currentClient(): TenantClient {
  const key = currentUserKey();
  const cached = clients.get(key);
  if (cached) return cached;
  const username = key.replace(/^user:/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user';
  const client = openDatabase(join(dirname(primaryDatabasePath), 'users', `${username}.db`));
  clients.set(key, client);
  return client;
}

export function setDatabaseUserContext(username: string, role: 'admin' | 'user') {
  databaseUser.enterWith(role === 'admin' ? 'admin' : `user:${username}`);
}

export function runWithDatabaseUserContext<T>(username: string, role: 'admin' | 'user', callback: () => T): T {
  return databaseUser.run(role === 'admin' ? 'admin' : `user:${username}`, callback);
}

export function getCurrentDatabasePath() {
  const key = currentUserKey();
  if (key === 'admin') return primaryDatabasePath;
  const username = key.replace(/^user:/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'user';
  return join(dirname(primaryDatabasePath), 'users', `${username}.db`);
}

export const sqlite = new Proxy(primaryClient.sqlite, {
  get(_target, property) {
    const current = currentClient().sqlite;
    const value = Reflect.get(current, property, current);
    return typeof value === 'function' ? value.bind(current) : value;
  },
}) as Sqlite;

export const db = new Proxy(primaryClient.db, {
  get(_target, property) {
    const current = currentClient().db;
    const value = Reflect.get(current, property, current);
    return typeof value === 'function' ? value.bind(current) : value;
  },
}) as typeof primaryClient.db;
