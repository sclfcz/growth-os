'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';

type ActiveActivity = { category: '学习' | '工作'; title: string; elapsedSeconds: number } | null;
type Overview = {
  paired: boolean;
  partner: { username: string; nickname: string } | null;
  partnerSharing?: { shareStudy: boolean; shareActivity: boolean };
  studySeconds: number | null;
  activeActivity: ActiveActivity;
  unreadCount: number;
  latestUnread: { id: number; sender: string; content: string; createdAt: string } | null;
};
type Message = { id: number; sender: string; recipient: string; content: string; createdAt: string };
type Preferences = { shareStudy: boolean; shareActivity: boolean };

const formatDuration = (seconds: number) => `${Math.floor(seconds / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分`;
const formatClock = (seconds: number) => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const openEvent = 'growth-together-open';

export function openTogetherConversation() {
  window.dispatchEvent(new Event(openEvent));
}

export function TogetherCard({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [snapshotAt, setSnapshotAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/together', { cache: 'no-store' });
      if (!response.ok) throw new Error('状态暂时无法读取');
      const data = await response.json() as Overview;
      setOverview(data);
      setSnapshotAt(Date.now());
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '状态暂时无法读取');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => { if (!document.hidden) void refresh(); }, 15_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const visibility = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener('visibilitychange', visibility); };
  }, [refresh]);
  const studySeconds = overview?.studySeconds === null || overview?.studySeconds === undefined ? null : overview.studySeconds + (overview.activeActivity?.category === '学习' ? Math.floor((now - snapshotAt) / 1000) : 0);

  return <article className={`dashboard-card together-card together-card-${variant}`}>
    <div className="card-header"><div><p className="card-kicker">一起 · 今日</p><h2>{overview?.partner?.nickname ?? '一起'}</h2></div><button className="together-open-button" onClick={openTogetherConversation} aria-label="打开留言"><MessageCircle size={18}/>{(overview?.unreadCount ?? 0) > 0 && <span>{overview?.unreadCount}</span>}</button></div>
    {!overview?.paired ? <p className="quiet-copy">当前账号还没有配对。</p> : <>
      <div className="together-study-total"><span>今日学习 · 截至此刻</span>{studySeconds === null ? <strong className="together-private">对方尚未开启学习时长共享</strong> : <strong>{formatDuration(studySeconds)}</strong>}</div>
      {overview.activeActivity && <div className="together-active"><div><span className="together-active-kind">● 正在{overview.activeActivity.category}</span><span className="together-active-elapsed">本次 {formatClock(overview.activeActivity.elapsedSeconds)}</span></div><strong>{overview.activeActivity.title}</strong></div>}
      {overview.unreadCount > 0 && overview.latestUnread && <button className="together-latest" onClick={openTogetherConversation}><span>{overview.unreadCount} 条未读</span><strong>{overview.latestUnread.content}</strong><span aria-hidden="true">↗</span></button>}
      {overview.unreadCount === 0 && <button className="together-message-link" onClick={openTogetherConversation}>{overview.latestUnread ? '继续对话' : '给对方留言'} <span>↗</span></button>}
      {error && <p className="quiet-copy">{error}</p>}
    </>}
  </article>;
}

export function TogetherSettings() {
  const [preferences, setPreferences] = useState<Preferences>({ shareStudy: false, shareActivity: false });
  const [paired, setPaired] = useState(true);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void Promise.all([fetch('/api/together/preferences').then(async response => ({ response, data: await response.json() as Preferences & { error?: { message?: string } } })), fetch('/api/together').then(response => response.json() as Promise<Overview>)]).then(([preferenceResult, overview]) => {
      if (preferenceResult.response.ok) setPreferences(preferenceResult.data);
      else if (preferenceResult.data.error?.message) { setPaired(false); setMessage(preferenceResult.data.error.message); }
      setPaired(overview.paired);
    }).catch(() => setMessage('共享设置暂时无法读取。'));
  }, []);
  async function save(next: Preferences) {
    const previous = preferences;
    setPreferences(next);
    setSaving(true);
    const response = await fetch('/api/together/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }).catch(() => null);
    setSaving(false);
    if (!response?.ok) { setPreferences(previous); setMessage('保存失败，已恢复原设置。'); return; }
    setMessage('共享设置已保存。');
  }
  return <article className="setting-card together-settings"><h2>一起</h2><p>与配对账号共用一个留言会话。关闭某项后，对方将无法查看对应信息。</p>{!paired ? <p className="muted">当前账号尚未与另一账号配对。</p> : <>
    <label className="together-setting-row"><span><strong>分享今日学习累计</strong><small>只分享北京时间零点至现在的学习时长，包含正在计时的部分。</small></span><input type="checkbox" checked={preferences.shareStudy} disabled={saving} onChange={event => void save({ ...preferences, shareStudy: event.target.checked })}/></label>
    <label className="together-setting-row"><span><strong>分享正在做的事项</strong><small>只分享类别、事项名称和本次时长，不分享补充说明。</small></span><input type="checkbox" checked={preferences.shareActivity} disabled={saving} onChange={event => void save({ ...preferences, shareActivity: event.target.checked })}/></label>
    <small className="muted">学习累计和当前事项分别控制。运动、记账、复盘等个人内容不会共享。</small>
  </>}{message && <p role="status">{message}</p>}</article>;
}

export function TogetherMessenger() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [scrollAtBottom, setScrollAtBottom] = useState(true);
  const messagesRef = useRef<HTMLDivElement>(null);
  const refreshOverview = useCallback(async () => {
    const response = await fetch('/api/together', { cache: 'no-store' });
    if (response.ok) setOverview(await response.json() as Overview);
  }, []);
  const refreshMessages = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/together/messages?limit=100', { cache: 'no-store' });
      const data = await response.json() as { messages?: Message[]; error?: { message?: string } };
      if (!response.ok || !data.messages) throw new Error(data.error?.message ?? '消息暂时无法读取');
      setMessages(current => {
        const wasAtBottom = !messagesRef.current || messagesRef.current.scrollHeight - messagesRef.current.scrollTop - messagesRef.current.clientHeight < 72;
        setScrollAtBottom(wasAtBottom);
        return data.messages ?? current;
      });
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '消息暂时无法读取');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refreshOverview();
    const poll = window.setInterval(() => { if (!document.hidden) void refreshOverview(); }, 15_000);
    const onOpen = () => { setOpen(true); };
    window.addEventListener(openEvent, onOpen);
    return () => { window.clearInterval(poll); window.removeEventListener(openEvent, onOpen); };
  }, [refreshOverview]);
  useEffect(() => { if (open) void refreshMessages(); }, [open, refreshMessages]);
  useEffect(() => {
    if (!open) return;
    const poll = window.setInterval(() => { if (!document.hidden) { void refreshMessages(); void refreshOverview(); } }, 3000);
    const visibility = () => { if (!document.hidden) { void refreshMessages(); void refreshOverview(); } };
    document.addEventListener('visibilitychange', visibility);
    return () => { window.clearInterval(poll); document.removeEventListener('visibilitychange', visibility); };
  }, [open, refreshMessages, refreshOverview]);
  useEffect(() => {
    if (!open || !scrollAtBottom || !messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, open, scrollAtBottom]);
  useEffect(() => {
    if (!open || document.hidden) return;
    const lastReceived = [...messages].reverse().find(message => message.sender === overview?.partner?.username);
    if (!lastReceived) return;
    const frame = window.requestAnimationFrame(() => {
      void fetch('/api/together/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lastReadId: lastReceived.id }) }).then(() => refreshOverview());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, open, overview?.partner?.username, refreshOverview]);
  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const response = await fetch('/api/together/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: crypto.randomUUID(), content }) });
      const data = await response.json() as { message?: Message; error?: { message?: string } };
      if (!response.ok || !data.message) throw new Error(data.error?.message ?? '发送失败，请重试');
      setMessages(current => [...current.filter(message => message.id !== data.message?.id), data.message!]);
      setDraft(''); setError(''); setScrollAtBottom(true);
      void refreshOverview();
    } catch (caught) { setError(caught instanceof Error ? caught.message : '发送失败，请重试'); }
    finally { setSending(false); }
  }
  const unread = overview?.unreadCount ?? 0;
  return <>
    <button className="together-floating-entry" onClick={() => setOpen(true)} aria-label={unread ? `${unread} 条未读留言` : '打开一起留言'}><MessageCircle size={18}/><span>一起</span>{unread > 0 && <b>{unread}</b>}</button>
    {open && <div className="together-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}><section className="together-drawer" role="dialog" aria-modal="true" aria-label="一起留言"><header><div><p className="card-kicker">一起 · 留言也是聊天</p><h2>{overview?.partner?.nickname ?? '对话'}</h2></div><button className="together-close" onClick={() => setOpen(false)} aria-label="关闭留言"><X size={20}/></button></header>{overview?.partnerSharing?.shareStudy === false && <p className="together-share-note">对方还没有开启学习累计共享。</p>}<div className="together-message-list" ref={messagesRef} onScroll={event => { const element = event.currentTarget; setScrollAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 72); }} aria-live="polite">{loading && messages.length === 0 && <p className="quiet-copy">正在读取对话…</p>}{messages.length === 0 && !loading && <p className="together-empty">还没有消息，写下第一句吧。</p>}{messages.map(message => <article className={`together-message ${message.sender === overview?.partner?.username ? 'received' : 'sent'}`} key={message.id}><small>{message.sender === overview?.partner?.username ? overview.partner.nickname : '我'} · {new Date(message.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small><p>{message.content}</p></article>)}</div>{error && <p className="together-error" role="status">{error}</p>}<form className="together-compose" onSubmit={event => { event.preventDefault(); void send(); }}><textarea value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} placeholder="留句话给对方…" aria-label="留言内容" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }}/><footer><small>{draft.length}/2000 · Enter 发送，Shift+Enter 换行</small><button type="submit" disabled={!draft.trim() || sending}><Send size={16}/>{sending ? '发送中…' : '发送'}</button></footer></form></section></div>}
  </>;
}
