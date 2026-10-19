'use client';

import { useEffect, useRef, useState } from 'react';

type Report = {
  score?: number;
  score_reasoning?: string;
  review_paragraphs?: string[];
  review?: string;
  tomorrow_focus?: string;
  highlights?: string[];
  problems?: string[];
  suggestions?: string[];
  tomorrow_top3?: { title: string; category: string }[];
  trends?: string[];
  patterns?: string[];
  next_week_suggestions?: string[];
  core_idea?: string;
  pitfalls?: string[];
  mnemonic?: string;
};
type ContextSummary = {
  date: string;
  reflectionIncluded: boolean;
  studyMinutes: number;
  studyTargetMinutes: number;
  leetcodeReviewed: number;
  leetcodePlanned: number;
  priorities: number;
  prioritiesDone: number;
  exerciseActions: number;
  exerciseSets: number;
  bodyWeightKg: number | null;
  meditationCount: number;
  spentTodayCents: number;
  dailyLimitCents: number;
  overDailyLimit: boolean;
  spentThisMonthCents: number;
  monthlyBudgetCents: number;
  previousReflectionCount: number;
};

export function AiReportButton({ type, reference, input, autoTrigger = 0 }: {
  type: 'daily' | 'weekly' | 'leech';
  reference: string;
  input: Record<string, unknown>;
  autoTrigger?: number;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [contextSummary, setContextSummary] = useState<ContextSummary | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setReport(null);
    setContextSummary(null);
    setMessage('');
  }, [reference, type]);

  async function generate(regenerate = false) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/ai/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, ref: reference, input, regenerate }),
      });
      const data = await response.json();
      if (data.contextSummary) setContextSummary(data.contextSummary as ContextSummary);
      if (!response.ok) throw new Error(data.error?.message ?? '生成失败');
      setReport(data.report as Report);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '智能复盘生成失败');
    } finally {
      setBusy(false);
    }
  }

  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => { if (autoTrigger > 0) void generateRef.current(true); }, [autoTrigger]);

  async function addTomorrowTask(title: string, category = 'important') {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, category, isTop3: true, tomorrow: true }),
    });
    setMessage(response.ok ? '已加入明日计划。' : '添加失败，请重试。');
  }

  const paragraphs = report?.review_paragraphs?.map(value => value.trim()).filter(Boolean)
    ?? report?.review?.split(/\n\s*\n/).map(value => value.trim()).filter(Boolean)
    ?? [];
  return <div className="ai-report">
    <button className="mini-button" onClick={() => void generate()} disabled={busy}>
      {busy ? '正在生成…' : '生成智能复盘'}
    </button>
    {report && <section className="setting-card ai-review-card">
      <header className="ai-review-header">
        <div><p className="card-kicker">复盘师评价</p><h3>{type === 'daily' ? `${reference} 复盘` : '今天'}</h3></div>
        {report.score !== undefined && <div className="ai-review-score"><strong>{report.score}</strong><span>/ 100</span></div>}
      </header>
      {report.score_reasoning && <p className="ai-score-reason">{report.score_reasoning}</p>}
      {paragraphs.length > 0 ? <div className="ai-review-prose">{paragraphs.map((paragraph, index) => <p key={`review-${index}`}>{paragraph}</p>)}</div> : <div className="ai-review-prose">
        {report.highlights?.map((value, index) => <p key={`h${index}`}>{value}</p>)}
        {report.problems?.map((value, index) => <p key={`p${index}`}>{value}</p>)}
        {report.suggestions?.map((value, index) => <p key={`s${index}`}>{value}</p>)}
        {report.trends?.map((value, index) => <p key={`tr${index}`}>{value}</p>)}
        {report.patterns?.map((value, index) => <p key={`pa${index}`}>{value}</p>)}
        {report.next_week_suggestions?.map((value, index) => <p key={`nw${index}`}>{value}</p>)}
        {report.core_idea && <p>{report.core_idea}</p>}
        {report.pitfalls?.map((value, index) => <p key={`pit${index}`}>{value}</p>)}
        {report.mnemonic && <p>{report.mnemonic}</p>}
      </div>}
      {report.tomorrow_focus && <div className="ai-tomorrow-focus"><div><p className="card-kicker">明日重点</p><p>{report.tomorrow_focus}</p></div><button className="mini-button" onClick={() => void addTomorrowTask(report.tomorrow_focus!)}>加入明日计划</button></div>}
      {type !== 'daily' && report.tomorrow_top3?.map((task, index) => <div className="ai-tomorrow-focus" key={`t${index}`}><div><p className="card-kicker">明日重点</p><p>{task.title}</p></div><button className="mini-button" onClick={() => void addTomorrowTask(task.title)}>加入明日计划</button></div>)}
      {type !== 'daily' && <button className="mini-button" onClick={() => void generate(true)} disabled={busy}>重新生成</button>}
    </section>}
    {type === 'daily' && contextSummary && <details className="ai-context-details">
      <summary>本次请求包含的数据</summary>
      <div className="ai-context-grid">
        <span>复盘感受与问题：{contextSummary.reflectionIncluded ? '已包含' : '缺失'}</span>
        <span>学习：{Math.floor(contextSummary.studyMinutes / 60)}小时{contextSummary.studyMinutes % 60}分 / 目标 {Math.floor(contextSummary.studyTargetMinutes / 60)}小时</span>
        <span>力扣：完成 {contextSummary.leetcodeReviewed} 题，计划 {contextSummary.leetcodePlanned} 题</span>
        <span>今日计划：完成 {contextSummary.prioritiesDone} / {contextSummary.priorities} 项</span>
        <span>健身：{contextSummary.exerciseActions} 个动作、{contextSummary.exerciseSets} 组{contextSummary.bodyWeightKg !== null ? `，体重 ${contextSummary.bodyWeightKg} kg` : ''}</span>
        <span>冥想：{contextSummary.meditationCount} 次</span>
        <span>今日支出：¥{(contextSummary.spentTodayCents / 100).toFixed(2)}，{contextSummary.overDailyLimit ? `超过 ¥${(contextSummary.dailyLimitCents / 100).toFixed(2)} 参考线` : `未超过 ¥${(contextSummary.dailyLimitCents / 100).toFixed(2)} 参考线`}</span>
        <span>本月支出：¥{(contextSummary.spentThisMonthCents / 100).toFixed(2)} / ¥{(contextSummary.monthlyBudgetCents / 100).toFixed(2)}</span>
        <span>过往复盘：近 30 天 {contextSummary.previousReflectionCount} 条</span>
      </div>
    </details>}
    {message && <p role="alert">{message}<button className="mini-button" onClick={() => void generate(true)} disabled={busy}>重试</button></p>}
  </div>;
}
