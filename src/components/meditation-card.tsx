'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type MeditationSession = { id: number; durationMinutes: number; startedAt: string; endsAt: string };
type MeditationState = { date: string; count: number; target: number; activeSession: MeditationSession | null };

const formatCountdown = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function playChime(context: AudioContext) {
  [523.25, 659.25, 783.99].forEach((frequency, index) => {
    const startAt = context.currentTime + index * 0.2;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.34);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.36);
  });
}

export function MeditationCard() {
  const router = useRouter();
  const [data, setData] = useState<MeditationState | null>(null);
  const [minutes, setMinutes] = useState(10);
  const [clock, setClock] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const audioContext = useRef<AudioContext | null>(null);
  const completingId = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/meditation');
      if (response.status === 401) { router.replace('/login'); return; }
      if (!response.ok) throw new Error('冥想记录暂时无法读取。');
      setData(await response.json() as MeditationState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '冥想记录暂时无法读取。');
    }
  }, [router]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const active = data?.activeSession ?? null;
  const remainingSeconds = active ? Math.max(0, Math.ceil((Date.parse(active.endsAt) - clock) / 1000)) : 0;

  const complete = useCallback(async (id: number) => {
    const response = await fetch('/api/meditation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'complete', id }) });
    if (response.status === 401) { router.replace('/login'); return; }
    if (response.status === 409) { completingId.current = null; return; }
    if (!response.ok) { setMessage('冥想完成记录失败，请稍后重试。'); return; }
    if (audioContext.current) playChime(audioContext.current);
    setMessage('冥想完成，已计入今日次数。');
    await refresh();
  }, [refresh, router]);

  useEffect(() => {
    if (!active || remainingSeconds > 0 || completingId.current === active.id) return;
    completingId.current = active.id;
    void complete(active.id);
  }, [active, complete, remainingSeconds]);

  async function start() {
    setBusy(true);
    setMessage('');
    try {
      try {
        if (typeof window !== 'undefined' && 'AudioContext' in window) {
          audioContext.current ??= new window.AudioContext();
          await audioContext.current.resume();
        }
      } catch { /* Timer continues if browser audio is unavailable. */ }
      const response = await fetch('/api/meditation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'start', minutes }) });
      const result = await response.json() as { session?: MeditationSession; error?: { message?: string } };
      if (response.status === 401) { router.replace('/login'); return; }
      const session = result.session;
      if (!response.ok || !session) throw new Error(result.error?.message ?? '冥想计时启动失败。');
      completingId.current = null;
      setData(current => current ? { ...current, activeSession: session } : { date: '', count: 0, target: 1, activeSession: session });
      setMessage('冥想已开始，结束时会播放提示音。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '冥想计时启动失败。');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!active) return;
    setBusy(true);
    try {
      const response = await fetch('/api/meditation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel', id: active.id }) });
      if (response.status === 401) { router.replace('/login'); return; }
      if (!response.ok) throw new Error('结束冥想失败，请重试。');
      completingId.current = null;
      setMessage('本次冥想已结束，未计入完成次数。');
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : '结束冥想失败，请重试。'); }
    finally { setBusy(false); }
  }

  const target = data?.target ?? 1;
  const count = data?.count ?? 0;
  const progress = active ? Math.max(0, Math.min(100, 100 - remainingSeconds / (active.durationMinutes * 60) * 100)) : 0;

  return <article className="dashboard-card meditation-card">
    <div className="card-header"><div><p className="card-kicker">冥想 · 今日</p><h2>冥想</h2></div></div>
    <div className="meditation-count"><strong>{count}</strong><span>/ {target} 次</span><small>{count >= target ? '今日目标已达成' : '今日目标 1 次'}</small></div>
    {active ? <>
      <div className="meditation-timer" aria-live="off">{formatCountdown(remainingSeconds)}</div>
      <div className="meditation-progress" role="progressbar" aria-label="冥想进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{ width: `${progress}%` }}/></div>
      <div className="meditation-controls"><button className="mini-button" onClick={() => void cancel()} disabled={busy}>提前结束</button></div>
    </> : <div className="meditation-controls">
      <label htmlFor="meditation-minutes">时长（分钟）</label>
      <input id="meditation-minutes" type="number" min={1} max={120} step={1} value={minutes} onChange={event => setMinutes(Math.max(1, Math.min(120, Number(event.target.value) || 1)))}/>
      <button className="mini-button meditation-start" onClick={() => void start()} disabled={busy}>{busy ? '准备中…' : '开始冥想'}</button>
    </div>}
    <p className="meditation-hint">默认 10 分钟 · 完成时播放轻柔提示音</p>
    {message && <p className="status-message" role="status">{message}</p>}
  </article>;
}
