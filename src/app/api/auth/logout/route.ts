import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { sameOrigin } from '@/server/http';
export const dynamic='force-dynamic';
export async function POST(request: NextRequest) { if (!sameOrigin(request)) return NextResponse.json({ error: { code: 'INVALID_ORIGIN', message: '请求来源校验失败' } }, { status: 403 }); const response = NextResponse.json({ ok: true }); const session = await getSession(request, response); session.destroy(); return response; }
