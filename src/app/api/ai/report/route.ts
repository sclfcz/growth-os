import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getSession } from '@/server/auth';
import { chatCompletion } from '@/server/ai/client';
import { db } from '@/server/db/client';
import { aiReports, bodyWeights, dailyPlanItems, dayMeta, decks, exercises, items, journals, meditationSessions, reviewLogs, settings, studyTimeLogs, tasks, transactions, workouts, workoutSets } from '@/server/db/schema';
import { addDays } from '@/server/core/date';

const schema = z.object({
  type: z.enum(['daily', 'weekly', 'leech']),
  ref: z.string().max(40),
  input: z.record(z.string(), z.unknown()),
  regenerate: z.boolean().optional(),
});
const outputSchema = z.object({
  score: z.preprocess(value => typeof value === 'string' && value.trim() ? Number(value) : value, z.number().int().min(0).max(100)).optional(),
  score_reasoning: z.string().max(1200).optional(),
  review_paragraphs: z.union([z.array(z.string()).max(8), z.string()]).optional(),
  review: z.union([z.string(), z.array(z.string())]).optional(),
  tomorrow_focus: z.string().max(1200).nullable().optional(),
  highlights: z.array(z.string()).max(3).optional(),
  problems: z.array(z.string()).max(3).optional(),
  suggestions: z.array(z.string()).max(3).optional(),
  tomorrow_top3: z.array(z.object({ title: z.string(), category: z.string() })).max(3).optional(),
  trends: z.array(z.string()).optional(),
  patterns: z.array(z.string()).optional(),
  next_week_suggestions: z.array(z.string()).optional(),
  core_idea: z.string().optional(),
  pitfalls: z.array(z.string()).optional(),
  mnemonic: z.string().optional(),
}).passthrough();

export const dynamic = 'force-dynamic';

function parseJson(value: string | null | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function summarizeDailyInput(input: Record<string, unknown>) {
  const home = input.homepage as {
    date: string;
    study: { seconds: number; targetSeconds: number };
    leetcode: { reviewed: unknown[]; plan: unknown[] };
    priorities: { status: string }[];
    fitness: { actionCount: number; setCount: number; bodyWeightKg: number | null };
    meditation: { completedCount: number };
    spending: { todayCents: number; dailyLimitCents: number; overDailyLimit: boolean; monthCents: number; monthlyBudgetCents: number };
  };
  return {
    date: home.date,
    reflectionIncluded: input.reflection !== null,
    studyMinutes: Math.round(home.study.seconds / 60),
    studyTargetMinutes: Math.round(home.study.targetSeconds / 60),
    leetcodeReviewed: home.leetcode.reviewed.length,
    leetcodePlanned: home.leetcode.plan.length,
    priorities: home.priorities.length,
    prioritiesDone: home.priorities.filter(task => task.status === 'done').length,
    exerciseActions: home.fitness.actionCount,
    exerciseSets: home.fitness.setCount,
    bodyWeightKg: home.fitness.bodyWeightKg,
    meditationCount: home.meditation.completedCount,
    spentTodayCents: home.spending.todayCents,
    dailyLimitCents: home.spending.dailyLimitCents,
    overDailyLimit: home.spending.overDailyLimit,
    spentThisMonthCents: home.spending.monthCents,
    monthlyBudgetCents: home.spending.monthlyBudgetCents,
    previousReflectionCount: Array.isArray(input.previousReflections) ? input.previousReflections.length : 0,
  };
}

function normalizeParagraphs(value: unknown): string[] {
  const source = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('\n\n') : typeof value === 'string' ? value : '';
  const explicit = source.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
  if (explicit.length >= 3) return explicit.length <= 4 ? explicit : [...explicit.slice(0, 3), explicit.slice(3).join('\n\n')];
  const sentences = source.split(/(?<=[。！？!?])\s*/u).map(part => part.trim()).filter(Boolean);
  if (sentences.length >= 4) {
    const groups = Array.from({ length: 4 }, () => [] as string[]);
    sentences.forEach((sentence, index) => groups[Math.min(3, Math.floor(index * 4 / sentences.length))].push(sentence));
    return groups.map(group => group.join('')).filter(Boolean);
  }
  if (sentences.length >= 2) return sentences.map(sentence => sentence);
  return explicit;
}

function fallbackParagraphs(data: z.infer<typeof outputSchema>): string[] {
  const paragraphs = [
    ...(data.highlights ?? []),
    ...(data.problems ?? []),
    ...(data.suggestions ?? []),
    ...(data.trends ?? []),
    ...(data.patterns ?? []),
  ].filter(Boolean);
  return paragraphs.slice(0, 4);
}

function parseModelJson(raw: string): unknown {
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('AI 返回内容中没有 JSON 对象');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const candidate = raw.slice(start, index + 1);
        try { return JSON.parse(candidate) as unknown; }
        catch { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) as unknown; }
      }
    }
  }
  throw new Error('AI 返回的 JSON 不完整');
}

function getDailyContext(date: string, submitted: Record<string, unknown>) {
  const journal = db.select().from(journals).where(eq(journals.date, date)).get() ?? submitted.journal ?? null;
  const studyRows = db.select().from(studyTimeLogs).all().filter(row => row.date === date);
  const now = Date.now();
  const durationSeconds = (row: typeof studyRows[number]) => row.endedAt
    ? row.durationSeconds ?? Math.max(0, Math.floor((Date.parse(row.endedAt) - Date.parse(row.startedAt)) / 1000))
    : Math.max(0, Math.floor((now - Date.parse(row.startedAt)) / 1000));
  const timeByCategory = (category: 'study' | 'work') => studyRows.filter(row => row.category === category).reduce((sum, row) => sum + durationSeconds(row), 0);
  const todayTasks = db.select().from(tasks).all().filter(row => row.date === date)
    .sort((a, b) => ({ 'urgent-important': 0, important: 1, urgent: 2 }[a.priority as 'urgent-important' | 'important' | 'urgent'] ?? 1) - ({ 'urgent-important': 0, important: 1, urgent: 2 }[b.priority as 'urgent-important' | 'important' | 'urgent'] ?? 1));
  const itemRows = db.select().from(items).all();
  const deckRows = db.select().from(decks).all();
  const leetcodeDeckIds = new Set(deckRows.filter(deck => /leetcode|力扣|hot\s*100/i.test(deck.name)).map(deck => deck.id));
  const leetcode = db.select().from(reviewLogs).all().filter(row => row.date === date && leetcodeDeckIds.has(itemRows.find(item => item.id === row.itemId)?.deckId ?? -1))
    .map(row => ({ title: itemRows.find(item => item.id === row.itemId)?.title ?? '题目', rating: row.rating, minutes: row.minutes }));
  const exerciseRows = db.select().from(exercises).all();
  const todayWorkouts = db.select().from(workouts).all().filter(row => row.date === date);
  const exerciseById = new Map(exerciseRows.map(row => [row.id, row.name]));
  const training = todayWorkouts.map(workout => ({
    status: workout.status,
    note: workout.note,
    sets: db.select().from(workoutSets).all().filter(row => row.workoutId === workout.id).map(row => ({
      action: exerciseById.get(row.exerciseId) ?? '训练', weightKg: row.weightKg, reps: row.reps, set: row.setIndex,
    })),
  }));
  const today = db.select().from(transactions).all().filter(row => row.date === date && row.kind === 'expense');
  const month = date.slice(0, 7);
  const monthExpenses = db.select().from(transactions).all().filter(row => row.date.startsWith(month) && row.date <= date && row.kind === 'expense');
  const budgetRow = db.select().from(settings).where(eq(settings.key, 'monthly_budget_cents')).get();
  const monthlyBudgetCents = budgetRow ? Number(parseJson(budgetRow.value)) : 300000;
  const meditation = db.select().from(meditationSessions).all().filter(row => row.date === date);
  const latestWeight = db.select().from(bodyWeights).all().filter(row => row.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  const since = addDays(date, -30);
  const reflectionHistory = db.select().from(journals).all().filter(row => row.date < date && row.date >= since)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(row => {
      const previousReport = db.select().from(aiReports).all().find(report => report.type === 'daily' && report.ref === row.date && report.status === 'done');
      const summary = parseJson(previousReport?.output) as { review?: string; review_paragraphs?: string[]; score?: number; score_reasoning?: string } | null;
      return {
        date: row.date, mood: row.mood, energy: row.energy, sleepHours: row.sleepHours,
        gains: row.gains, problems: row.problems, tomorrowTop1: row.tomorrowTop1,
        aiSummary: summary ? { score: summary.score, review: summary.review_paragraphs?.join('\n\n') ?? summary.review, scoreReasoning: summary.score_reasoning } : null,
      };
    });
  const leetcodePlan = db.select().from(dailyPlanItems).all().filter(row => row.date === date && leetcodeDeckIds.has(itemRows.find(item => item.id === row.itemId)?.deckId ?? -1))
    .map(row => ({ title: itemRows.find(item => item.id === row.itemId)?.title ?? '题目', kind: row.kind, done: row.doneLogId !== null }));
  const dayType = db.select().from(dayMeta).all().find(row => row.date === date)?.dayType ?? 'normal';
  const studyGoalSetting = db.select().from(settings).all().find(row => row.key === 'daily_study_goal_minutes');
  const studyTargetSeconds = studyGoalSetting ? Number(parseJson(studyGoalSetting.value)) * 60 : 6 * 60 * 60;
  const todaySpentCents = today.reduce((sum, row) => sum + row.amountCents, 0);
  const monthSpentCents = monthExpenses.reduce((sum, row) => sum + row.amountCents, 0);
  const workoutSetCount = training.reduce((sum, workout) => sum + workout.sets.length, 0);
  const actions = [...new Set(training.flatMap(workout => workout.sets.map(set => set.action)))];
  const overDailyLimit = todaySpentCents > 6000;
  const dailySpendingNote = overDailyLimit
    ? `今日支出 ${ (todaySpentCents / 100).toFixed(2) } 元，超过 60 元参考线 ${( (todaySpentCents - 6000) / 100 ).toFixed(2)} 元。`
    : `今日支出 ${(todaySpentCents / 100).toFixed(2)} 元，未超过 60 元参考线。`;

  return {
    date,
    reflection: journal,
    homepage: {
      date, dayType,
      study: { seconds: timeByCategory('study'), targetSeconds: studyTargetSeconds, entries: studyRows.map(row => ({ title: row.title, subtitle: row.subtitle, seconds: durationSeconds(row) })) },
      work: { seconds: timeByCategory('work'), entries: studyRows.filter(row => row.category === 'work').map(row => ({ title: row.title, seconds: durationSeconds(row) })) },
      leetcode: { reviewed: leetcode, plan: leetcodePlan },
      priorities: todayTasks.map(({ title, priority, status }) => ({ title, priority, status })),
      fitness: { actionCount: actions.length, actions, setCount: workoutSetCount, entries: training, bodyWeightKg: latestWeight?.kg ?? null },
      meditation: { completedCount: meditation.filter(row => row.completedAt !== null).length, sessions: meditation.map(row => ({ minutes: row.durationMinutes, completed: row.completedAt !== null })) },
      spending: { todayCents: todaySpentCents, monthCents: monthSpentCents, monthlyBudgetCents, dailyLimitCents: 6000, overDailyLimit, dailySpendingNote },
    },
    priorities: todayTasks.map(({ title, priority, status, isTop3 }) => ({ title, priority, status, isTop3: Boolean(isTop3) })),
    study: {
      loggedSeconds: timeByCategory('study'),
      targetSeconds: studyTargetSeconds,
      activeOrRecentEntries: studyRows.map(({ title, subtitle, startedAt, endedAt, durationSeconds: storedDuration, durationMinutes, note }) => ({ title, subtitle, startedAt, endedAt, seconds: storedDuration ?? (durationMinutes ? durationMinutes * 60 : null), note })),
      leetcodeReviews: leetcode,
    },
    work: { loggedSeconds: timeByCategory('work'), entries: studyRows.filter(row => row.category === 'work').map(row => ({ title: row.title, subtitle: row.subtitle, startedAt: row.startedAt, endedAt: row.endedAt, seconds: durationSeconds(row) })) },
    fitness: { entries: training, bodyWeightKg: latestWeight?.kg ?? null },
    meditation: { completedCount: meditation.filter(row => row.completedAt !== null).length, sessions: meditation.map(row => ({ minutes: row.durationMinutes, completed: row.completedAt !== null })) },
    spending: {
      todayCents: todaySpentCents,
      todayEntries: today.map(row => ({ amountCents: row.amountCents, note: row.note })),
      monthCents: monthSpentCents,
      monthlyBudgetCents,
      dailyLimitCents: 6000,
      overDailyLimit60: overDailyLimit,
      dailySpendingNote,
    },
    previousReflections: reflectionHistory,
    dashboardSnapshot: submitted.today ?? null,
  };
}

export async function POST(request: NextRequest) {
  const response = NextResponse.next();
  if (!(await getSession(request, response)).authenticated) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '复盘数据无效' } }, { status: 400 });

  const input = parsed.data.type === 'daily' ? getDailyContext(parsed.data.ref, parsed.data.input) : parsed.data.input;
  const contextSummary = parsed.data.type === 'daily' ? summarizeDailyInput(input) : null;
  const rawInput = JSON.stringify(input);
  const promptVersion = parsed.data.type === 'daily' ? 'daily-review-v5' : 'v1';
  const hash = createHash('sha256').update(`${parsed.data.type}:${promptVersion}:${parsed.data.ref}:${rawInput}`).digest('hex');
  const cached = db.select().from(aiReports).where(eq(aiReports.inputHash, hash)).get();
  if (cached?.output && !parsed.data.regenerate) return NextResponse.json({ report: JSON.parse(cached.output) as unknown, contextSummary, cached: true });

  const start = Date.now();
  try {
    const promptTemplate = await readFile(join(process.cwd(), 'src/server/ai/prompts', `${parsed.data.type}.md`), 'utf8');
    const model = parsed.data.type === 'weekly' ? process.env.AI_MODEL_WEEKLY || process.env.AI_MODEL : process.env.AI_MODEL;
    const raw = await chatCompletion(`${promptTemplate}\n\n输入数据：${rawInput}`, fetch, `growth-os-${parsed.data.type}-${parsed.data.ref}`, parsed.data.type === 'weekly' ? model : undefined, true);
    let output: unknown;
    try { output = parseModelJson(raw); }
    catch { return NextResponse.json({ error: { code: 'INVALID_AI_JSON', message: 'AI 返回的内容不是有效 JSON，请重试' }, retry: true }, { status: 502 }); }
    const valid = outputSchema.safeParse(output);
    if (!valid.success) return NextResponse.json({ error: { code: 'INVALID_AI_JSON', message: 'AI 返回内容格式异常，请重试' }, contextSummary, retry: true }, { status: 502 });
    let report = valid.data;
    if (parsed.data.type === 'daily') {
      const reviewParagraphs = normalizeParagraphs(report.review_paragraphs ?? report.review);
      const finalizedParagraphs = reviewParagraphs.length ? reviewParagraphs : fallbackParagraphs(report);
      if (finalizedParagraphs.length < 2) return NextResponse.json({ error: { code: 'INCOMPLETE_DAILY_REVIEW', message: '复盘内容过短，请重试生成。' }, contextSummary, retry: true }, { status: 502 });
      report = {
        ...report,
        review_paragraphs: finalizedParagraphs,
        tomorrow_focus: report.tomorrow_focus?.trim() || report.tomorrow_top3?.[0]?.title || undefined,
      };
    }
    const saved = {
      type: parsed.data.type, ref: parsed.data.ref, model, inputHash: hash, input: rawInput,
      output: JSON.stringify(report), raw, status: 'done', latencyMs: Date.now() - start,
    };
    if (cached) db.update(aiReports).set(saved).where(eq(aiReports.id, cached.id)).run();
    else db.insert(aiReports).values(saved).run();
    return NextResponse.json({ report, contextSummary, cached: false });
  } catch (error) {
    return NextResponse.json({ error: { code: 'AI_CONNECTION_FAILED', message: error instanceof Error ? error.message : 'AI 请求失败' }, contextSummary, retry: true }, { status: 502 });
  }
}
