import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getCurrentDatabasePath, sqlite } from '@/server/db/client';
import { getLogicalDate } from '@/server/core/date';
async function snapshot(target: string): Promise<void> {
 await mkdir(dirname(target), { recursive: true });
 sqlite.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
}
export async function createBackup(prefix: string): Promise<string> {
 const folder=join(dirname(getCurrentDatabasePath()),'backups');const date=getLogicalDate().replaceAll('-','');const target=join(folder,`${prefix}-${date}-${Date.now()}.db`);await snapshot(target);return target;
}
export async function maybeDailyBackup(now = new Date()): Promise<void> {
 const path=getCurrentDatabasePath();
 const folder = join(dirname(path), 'backups');
 await mkdir(folder, { recursive: true });
 const date = getLogicalDate(now).replaceAll('-', '');
 const target = join(folder, `growth-${date}.db`);
 try { await stat(target); return; } catch { /* create today's first backup */ }
 await snapshot(target);
 const files = (await readdir(folder)).filter(file => /^growth-\d{8}\.db$/.test(file)).sort().reverse();
 await Promise.all(files.slice(14).map(file => unlink(join(folder, file))));
}
