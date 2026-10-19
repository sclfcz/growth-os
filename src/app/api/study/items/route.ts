import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { items } from '@/server/db/schema';
import { getSession } from '@/server/auth';
import { getLogicalDate } from '@/server/core/date';
import { maybeDailyBackup } from '@/server/services/backup';
export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
 const response=NextResponse.next(); const session=await getSession(request,response);
 if(!session.authenticated)return NextResponse.json({error:{code:'UNAUTHORIZED',message:'请先登录'}},{status:401});
 await maybeDailyBackup();
 const rows=db.select().from(items).all(); const today=getLogicalDate();
 return NextResponse.json({items:rows.map(row=>({...row,due:row.dueDate!==null&&row.dueDate<=today}))});
}
