'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const REMINDER_AFTER_MS = 90 * 60 * 1000;
const RESPONSE_WINDOW_MS = 60 * 1000;
type ActiveLog = { id: number; category: 'study' | 'work'; title: string | null; startedAt: string };
type ReminderState = { startedAt: string; nextPromptAt: number; deadline?: number };
const storageKey = (username: string, id: number) => `growth-os:focus-reminder:${username}:${id}`;
const parseState = (username: string, log: ActiveLog): ReminderState => {
  const initial = Date.parse(log.startedAt) + REMINDER_AFTER_MS;
  try {
    const value = localStorage.getItem(storageKey(username, log.id));
    if (value) {
      const saved = JSON.parse(value) as ReminderState;
      if (saved.startedAt === log.startedAt && Number.isFinite(saved.nextPromptAt)) return saved;
    }
  } catch { /* Use the timer's start time when browser storage is unavailable. */ }
  return { startedAt: log.startedAt, nextPromptAt: initial };
};

export function FocusReminder() {
  const [username, setUsername] = useState('');
  const [activeLogs, setActiveLogs] = useState<ActiveLog[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [dismissedCycle, setDismissedCycle] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/study/time', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { username: string; activeLogs: ActiveLog[] };
      setUsername(data.username);
      setActiveLogs(data.activeLogs);
    } catch { /* Retry on the next poll. */ }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 10_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    const visibility = () => { if (!document.hidden) { setNow(Date.now()); void refresh(); } };
    window.addEventListener('focus', visibility);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
      window.removeEventListener('focus', visibility);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [refresh]);

  const dueLog = useMemo(() => {
    if (!username) return null;
    for (const log of activeLogs) {
      const saved = parseState(username, log);
      if (saved.deadline) return { log, saved };
      if (!saved.deadline && now >= saved.nextPromptAt) return { log, saved };
    }
    return null;
  }, [activeLogs, now, username]);

  useEffect(() => {
    if (!username) return;
    const activeIds = new Set(activeLogs.map(log => log.id));
    for (const log of activeLogs) {
      const saved = parseState(username, log);
      if (now >= saved.nextPromptAt && !saved.deadline) {
        saved.deadline = now + RESPONSE_WINDOW_MS;
        try { localStorage.setItem(storageKey(username, log.id), JSON.stringify(saved)); } catch { /* The visible timer still works for this page session. */ }
      }
    }
    // Remove stale reminder state when its timer was stopped in another tab.
    try {
      const prefix = `growth-os:focus-reminder:${username}:`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(prefix) && !activeIds.has(Number(key.slice(prefix.length)))) localStorage.removeItem(key);
      }
    } catch { /* Ignore unavailable local storage. */ }
  }, [activeLogs, now, username]);

  useEffect(() => {
    if (pendingId === null && dueLog?.saved.deadline && dueLog.saved.nextPromptAt !== dismissedCycle) setPendingId(dueLog.log.id);
    if (pendingId !== null && !activeLogs.some(log => log.id === pendingId)) setPendingId(null);
  }, [activeLogs, dismissedCycle, dueLog, pendingId]);

  const pending = activeLogs.find(log => log.id === pendingId);
  const pendingState = pending && username ? parseState(username, pending) : null;
  const remaining = pendingState?.deadline ? Math.max(0, Math.ceil((pendingState.deadline - now) / 1000)) : RESPONSE_WINDOW_MS / 1000;

  const saveStop = useCallback(async (log: ActiveLog, endedAt?: number) => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/study/time', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(endedAt
          ? { action: 'auto-stop', id: log.id, endedAt: new Date(endedAt).toISOString() }
          : { action: 'stop', id: log.id }),
      });
      if (!response.ok && response.status !== 404) throw new Error('保存没有成功，请重试。');
      if (username) {
        try { localStorage.removeItem(storageKey(username, log.id)); } catch { /* ignore */ }
      }
      setPendingId(null);
      await refresh();
      window.dispatchEvent(new CustomEvent('growth-os:focus-timer-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存没有成功，请重试。');
    } finally { setSaving(false); }
  }, [refresh, username]);

  useEffect(() => {
    if (!pending || !pendingState?.deadline || remaining > 0 || saving) return;
    void saveStop(pending, pendingState.deadline);
  }, [pending, pendingState, remaining, saveStop, saving]);

  function continueFocus() {
    if (!pending || !username) return;
    const next: ReminderState = { startedAt: pending.startedAt, nextPromptAt: Date.now() + REMINDER_AFTER_MS };
    try { localStorage.setItem(storageKey(username, pending.id), JSON.stringify(next)); } catch { /* Keep this page's session usable without persistence. */ }
    setPendingId(null);
    setDismissedCycle(pendingState?.nextPromptAt ?? null);
    setError('');
  }

  if (!pending || !pendingState?.deadline) return null;
  const category = pending.category === 'study' ? '学习' : '工作';
  return <div className="focus-reminder-backdrop">
    <section className="focus-reminder-dialog" role="alertdialog" aria-modal="true" aria-labelledby="focus-reminder-title" aria-describedby="focus-reminder-description">
      <p className="focus-reminder-eyebrow">专注时长提醒</p>
      <h2 id="focus-reminder-title">已经连续{category}超过 1.5 小时</h2>
      <p id="focus-reminder-description">你还在「{pending.title || category}」吗？如果忘记结束，倒计时结束后会自动停止，并把这段时间计入{category}时长。</p>
      <p className="focus-reminder-countdown">{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')} 后自动停止</p>
      {error && <p className="focus-reminder-error" role="alert">{error}</p>}
      <div className="focus-reminder-actions">
        <button type="button" className="focus-reminder-continue" onClick={continueFocus} disabled={saving}>继续专注</button>
        <button type="button" onClick={() => void saveStop(pending)} disabled={saving}>{saving ? '正在保存…' : '现在结束并保存'}</button>
      </div>
    </section>
  </div>;
}
