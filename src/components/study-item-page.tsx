'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { AiReportButton } from '@/components/ai-report-button';

type Item = { id: number; title: string; slug: string; url: string | null; note: string | null; status: string };

export function StudyItemPage({ itemId, aiEnabled }: { itemId: number; aiEnabled: boolean }) {
  const [item, setItem] = useState<Item | null>(null);
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [message, setMessage] = useState('');
  const [noteMessage, setNoteMessage] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    void fetch('/api/study/items').then(response => response.json()).then(data => {
      const found = (data.items as Item[]).find(row => row.id === itemId) ?? null;
      setItem(found);
      setNote(found?.note ?? '');
      setSavedNote(found?.note ?? '');
    });
  }, [itemId]);

  async function rate(rating: string) {
    if (!item) return;
    const response = await fetch('/api/study/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: item.id, rating }) });
    const data = await response.json();
    if (response.ok) setMessage(`已记录，将于 ${data.item.dueDate} 复习。`);
    else setMessage(data.error?.message ?? '保存失败，请重试。');
  }

  async function saveNote() {
    if (!item || savingNote) return;
    setSavingNote(true);
    setNoteMessage('');
    try {
      const response = await fetch('/api/study/note', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: item.id, note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? '保存失败，请重试。');
      setItem({ ...item, note });
      setSavedNote(note);
      setNoteMessage('笔记已保存');
    } catch (error) {
      setNoteMessage(error instanceof Error ? error.message : '笔记保存失败，请重试。');
    } finally {
      setSavingNote(false);
    }
  }

  const noteChanged = note !== savedNote;

  return <AppShell>
    <section className="page-head study-item-head">
      <p className="eyebrow">题目详情</p>
      <h1>{item?.title ?? '题目'}</h1>
      {item?.url && <a className="button-link" href={item.url} target="_blank" rel="noreferrer">打开题目 ↗</a>}
      <h2>这道题现在掌握得怎么样？</h2>
      <div className="rating-row">
        <button onClick={() => void rate('again')}>😵 不会</button>
        <button onClick={() => void rate('hard')}>🤔 模糊</button>
        <button onClick={() => void rate('good')}>✅ 熟练</button>
      </div>
      {message && <p className="study-item-message" role="status">{message}</p>}
    </section>

    {item && <section className="note-editor-card" aria-labelledby="personal-note-title">
      <header className="note-editor-header">
        <div>
          <p className="card-kicker">解题记录</p>
          <h2 id="personal-note-title">个人笔记</h2>
          <p>记下解题思路、关键边界和容易忽略的细节。</p>
        </div>
        <span className={`note-save-state ${noteChanged ? 'is-dirty' : ''}`}>{savingNote ? '正在保存' : noteChanged ? '有修改未保存' : '已同步'}</span>
      </header>
      <label className="note-editor-label" htmlFor="personal-note">笔记内容</label>
      <textarea id="personal-note" className="note-editor-input" maxLength={5000} value={note} onChange={event => setNote(event.target.value)} placeholder={'可以按这个顺序整理：\n\n1. 核心思路\n2. 关键步骤或代码要点\n3. 边界情况与易错点'} />
      <footer className="note-editor-footer">
        <span className="note-editor-hint">保存后会与这道题一起保留</span>
        <span className="note-editor-count">{note.length} / 5000</span>
        {noteMessage && <span className="note-editor-message" role="status">{noteMessage}</span>}
        <button className="note-save-button" onClick={() => void saveNote()} disabled={savingNote || !noteChanged}>{savingNote ? '正在保存…' : '保存笔记'}</button>
      </footer>
    </section>}

    {aiEnabled && item?.status === 'leech' && <section className="note-ai-card"><AiReportButton type="leech" reference={item.slug} input={{ title: item.title, note: item.note ?? '' }} /></section>}
  </AppShell>;
}
