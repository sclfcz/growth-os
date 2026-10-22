'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import Link from 'next/link';

type Item = { id: number; title: string; slug: string; status: string; dueDate: string | null; difficulty: string | null; category: string | null; lastRating: string | null };
type RoadmapItem = { id: number; title: string; difficulty: string | null };
type RoadmapDay = { date: string; reviews: RoadmapItem[]; newItems: RoadmapItem[] };
type Roadmap = { firstDate: string; dailyLimit: number; dailyNewLimit: number; remainingCount: number; days: RoadmapDay[]; estimatedFinishDate: string | null };
const displayDate = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
const difficultyLabel = (difficulty: string | null) => difficulty==='easy'?'简单':difficulty==='medium'?'中等':difficulty==='hard'?'困难':'未标难度';
const difficultyClass = (difficulty: string | null) => difficulty==='easy'?'easy':difficulty==='medium'?'medium':difficulty==='hard'?'hard':'unknown';

export default function StudyPage() {
  const [rows, setRows] = useState<Item[]>([]);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  useEffect(() => {
    void Promise.all([fetch('/api/study/items').then(response => response.json()), fetch('/api/study/roadmap').then(response => response.json())]).then(([itemData, planData]) => {
      setRows(itemData.items ?? []);
      if (Array.isArray(planData.days)) setRoadmap(planData as Roadmap);
    });
  }, []);
  const remainingDays = roadmap?.days.length ?? 0;
  return <AppShell>
    <section className="page-head"><p className="eyebrow">学习题库</p><h1>学习</h1><p>查看 Hot 100 的学习状态与后续首刷安排。</p><Link className="button-link" href="/study/onboard">标记已经刷过的题目 →</Link></section>
    {roadmap&&<section className="study-roadmap">
      <div className="study-roadmap-header"><div><p className="card-kicker">从明天开始</p><h2>剩余首刷计划</h2><p>还剩 {roadmap.remainingCount} 道新题 · 每天目标 {roadmap.dailyNewLimit} 道新题 · 预计约 {remainingDays} 个学习日</p></div><span className="roadmap-date">{roadmap.estimatedFinishDate?`${displayDate(roadmap.firstDate)} — ${displayDate(roadmap.estimatedFinishDate)}`:'已完成'}</span></div>
      <p className="roadmap-note">每天总量最多 {roadmap.dailyLimit} 道，已到期复习优先；复习多时至少安排 1 道新题。日期按当前已知复习估算，新题完成后产生的 FSRS 复习会让计划逐日更新。</p>
      {roadmap.days.length>0&&<details className="roadmap-details"><summary>查看逐日复习与新题安排</summary><div className="roadmap-days">{roadmap.days.map((day,index)=><article className="roadmap-day" key={day.date}><header><strong>{displayDate(day.date)}</strong><span>第 {index+1} 天 · 复习 {day.reviews.length} · 新题 {day.newItems.length}</span></header>{day.reviews.length>0&&<><p className="roadmap-note">复习题</p><ul>{day.reviews.map(item=><li key={`review-${item.id}`}><span>{item.title}</span><small className={`difficulty-badge difficulty-${difficultyClass(item.difficulty)}`}>{difficultyLabel(item.difficulty)}</small></li>)}</ul></>}{day.newItems.length>0&&<><p className="roadmap-note">新题</p><ul>{day.newItems.map(item=><li key={`new-${item.id}`}><span>{item.title}</span><small className={`difficulty-badge difficulty-${difficultyClass(item.difficulty)}`}>{difficultyLabel(item.difficulty)}</small></li>)}</ul></>}</article>)}</div></details>}
    </section>}
    <div className="item-list study-library">{rows.map(item=><Link className={`item-card ${item.status==='leech'?'leech-item':''}`} key={item.id} href={`/study/items/${item.id}`}><span className="item-category">{item.category??'待分类'} · <span className={`difficulty-badge difficulty-${difficultyClass(item.difficulty)}`}>{difficultyLabel(item.difficulty)}</span></span><strong>{item.title}{item.status==='leech'?' · 顽固题':''}</strong><span className="muted">{item.dueDate?`下次复习 ${item.dueDate}${item.lastRating==='hard'?' · 模糊':''}`:item.status==='new'?'尚未学习':item.lastRating==='hard'?'已学一遍 · 模糊':'已加入学习'}</span></Link>)}</div>
  </AppShell>;
}
