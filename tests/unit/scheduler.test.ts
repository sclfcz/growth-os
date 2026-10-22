import { describe, expect, it } from 'vitest';
import { addDays, getLogicalDate } from '@/server/core/date';
import { applyRating, deriveStatus, onboardDueOffset, spreadOnboardDueDates, undoRating } from '@/server/core/scheduler';
import { buildDailyPlan } from '@/server/core/planner';
import { monteCarloForecast } from '@/server/core/forecast';

describe('M1 验收用例', () => {
 it('FSRS 按不同评分安排下一次复习日期', () => {
  const today='2026-10-17'; const result=applyRating({stage:2,dueDate:null,status:'reviewing',lapses:0},'good',today,30);
  expect(result.stage).toBe(3); expect(result.dueDate).toBe('2026-10-20'); expect(result.interval).toBe(3);
 });
 it('FSRS 读取同一道题的历史反馈后再计算间隔',()=>{const result=applyRating({stage:2,dueDate:null,status:'reviewing',lapses:0},'good','2026-10-23',30,[{date:'2026-10-16',rating:'good',createdAt:'2026-10-16T12:00:00.000Z'}]);expect(result.dueDate).toBe('2026-11-13');});
 it('stage 3 不会降到 stage 1 并累加 lapse，三次 lapse 显示 leech',()=>{const result=applyRating({stage:3,dueDate:null,status:'reviewing',lapses:0},'again','2026-10-17');expect(result.stage).toBe(1);expect(result.lapses).toBe(1);expect(deriveStatus(1,3)).toBe('leech');});
 it('FSRS 历史稳定后遵守 30 天最大复习间隔',()=>{const history=Array.from({length:12},(_,index)=>{const date=addDays('2025-01-01',index*30);return{date,rating:'good' as const,createdAt:`${date}T12:00:00.000Z`};});const today=addDays(history[history.length-1].date,30);const result=applyRating({stage:6,dueDate:null,status:'reviewing',lapses:0},'good',today,30,history);expect(result.interval).toBeLessThanOrEqual(30);});
 it('轻量复习日安排两道新题，重负载日仍保留一道新题',()=>{expect(buildDailyPlan({budgetMinutes:150,dueCount:2})).toMatchObject({reviews:2,newItems:2,backlog:0});expect(buildDailyPlan({budgetMinutes:150,dueCount:3})).toMatchObject({reviews:3,newItems:1,backlog:0});expect(buildDailyPlan({budgetMinutes:150,dueCount:12,backlogCapacity:7})).toMatchObject({reviews:3,newItems:1,backlog:9,minutes:70});});
 it('积压较大时进入 clearing，但仍保留一道新题',()=>{expect(buildDailyPlan({budgetMinutes:150,dueCount:30,backlogCapacity:7})).toMatchObject({reviews:3,newItems:1,mode:'clearing'});});
 it('rest 日不安排新题，最多安排两道可选复习',()=>{expect(buildDailyPlan({budgetMinutes:150,dueCount:9,dayType:'rest'})).toMatchObject({reviews:2,newItems:0,mode:'rest'});});
 it('onboard 标记 50 道熟练后，第 4–12 天每天复习数之差不超过 1',()=>{const dates=spreadOnboardDueDates(50,'2026-10-17');const counts=Array.from({length:9},(_,i)=>dates.filter(date=>date===addDays('2026-10-17',i+4)).length);expect(Math.max(...counts)-Math.min(...counts)).toBeLessThanOrEqual(1);});
 it('onboard 不会、模糊、熟练的日期分别落在各自分散窗口',()=>{expect(Array.from({length:3},(_,i)=>onboardDueOffset(i,'again'))).toEqual([1,2,3]);expect(Array.from({length:5},(_,i)=>onboardDueOffset(i,'hard'))).toEqual([2,3,4,5,6]);expect(Array.from({length:9},(_,i)=>onboardDueOffset(i,'good'))).toEqual([4,5,6,7,8,9,10,11,12]);});
 it('凌晨 03:59 的逻辑日仍是前一天',()=>{expect(getLogicalDate(new Date('2026-10-17T19:59:00Z'),'Asia/Shanghai',4)).toBe('2026-10-17');});
 it('撤销快照可恢复状态',()=>{const before={stage:2,dueDate:'2026-10-20',status:'reviewing',lapses:1,lastRating:'hard' as const};expect(undoRating(before)).toEqual(before);});
 it('forecast 的 P80 不早于 P50，增加预算不推后 P50',()=>{const current=monteCarloForecast(100,100);const larger=monteCarloForecast(100,200);expect(current.p80).toBeGreaterThanOrEqual(current.p50);expect(larger.p50).toBeLessThanOrEqual(current.p50);});
});
