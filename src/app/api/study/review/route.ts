import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, sqlite } from '@/server/db/client';
import { items, reviewLogs, dailyPlanItems, settings } from '@/server/db/schema';
import { and, eq } from 'drizzle-orm';
import { getSession } from '@/server/auth';
import { applyRating, onboardDueOffset } from '@/server/core/scheduler';
import { addDays, getLogicalDate } from '@/server/core/date';
import { maybeDailyBackup } from '@/server/services/backup';
const inputSchema=z.object({itemId:z.number().int().positive(),rating:z.enum(['again','hard','good']),onboard:z.boolean().optional(),minutes:z.number().int().positive().optional(),note:z.string().max(500).optional()});
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const response=NextResponse.next(); const session=await getSession(request,response);if(!session.authenticated)return NextResponse.json({error:{code:'UNAUTHORIZED',message:'请先登录'}},{status:401});
 let json:unknown;try{json=await request.json();}catch{return NextResponse.json({error:{code:'INVALID_JSON',message:'请求格式错误'}},{status:400});}const parsed=inputSchema.safeParse(json);if(!parsed.success)return NextResponse.json({error:{code:'VALIDATION_ERROR',message:'反馈内容无效'}},{status:400});
 const item=db.select().from(items).where(eq(items.id,parsed.data.itemId)).get();if(!item)return NextResponse.json({error:{code:'NOT_FOUND',message:'题目不存在'}},{status:404});
 await maybeDailyBackup(); const before={stage:item.stage,dueDate:item.dueDate,status:item.status,lapses:item.lapses,lastRating:item.lastRating};const dueCounts:Record<string,number>={};for(const row of db.select({dueDate:items.dueDate}).from(items).all())if(row.dueDate)dueCounts[row.dueDate]=(dueCounts[row.dueDate]??0)+1;const maxRow=db.select().from(settings).all().find(row=>row.key==='max_interval_days');const maxInterval=maxRow?Number(JSON.parse(maxRow.value)):30;const schedule=applyRating({stage:item.stage,dueDate:item.dueDate,status:item.status,lapses:item.lapses,lastRating:item.lastRating as 'again'|'hard'|'good'|null},parsed.data.rating,getLogicalDate(),maxInterval,dueCounts);
 if(parsed.data.onboard){const onboardIndex=db.select().from(reviewLogs).all().filter(log=>log.date===getLogicalDate()&&log.note==='onboard'&&log.rating===parsed.data.rating).length;schedule.dueDate=addDays(getLogicalDate(),onboardDueOffset(onboardIndex,parsed.data.rating));}
 const txn=sqlite.transaction(()=>{db.update(items).set({stage:schedule.stage,dueDate:schedule.dueDate,status:schedule.status,lapses:schedule.lapses,lastRating:parsed.data.rating}).where(eq(items.id,item.id)).run();return db.insert(reviewLogs).values({itemId:item.id,date:getLogicalDate(),rating:parsed.data.rating,beforeJson:JSON.stringify(before),minutes:parsed.data.minutes??null,note:parsed.data.onboard?'onboard':parsed.data.note??null,createdAt:new Date().toISOString()}).returning().get();});
 const log=txn();if(!log)return NextResponse.json({error:{code:'INTERNAL',message:'反馈保存失败'}},{status:500});db.update(dailyPlanItems).set({doneLogId:log.id}).where(and(eq(dailyPlanItems.itemId,item.id),eq(dailyPlanItems.date,getLogicalDate()))).run();return NextResponse.json({log,item:{...item,...schedule}});
}
