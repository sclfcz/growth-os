import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { getSession } from '@/server/auth';
export const dynamic='force-dynamic';
export async function GET(request: NextRequest) {
 if (process.env.ACCESS_MODE !== 'ip') return NextResponse.json({ error: { code: 'NOT_FOUND', message: '未找到' } }, { status: 404 });
 const response = NextResponse.next();
 const session = await getSession(request, response);
 if (!session.authenticated) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
 try {
  const certificate = await readFile(process.env.CADDY_ROOT_CERT ?? './data/caddy/pki/authorities/local/root.crt');
  return new NextResponse(certificate.toString('utf8'), { headers: { 'Content-Type': 'application/x-x509-ca-cert', 'Content-Disposition': 'attachment; filename="growth-os-root.crt"' } });
 } catch { return NextResponse.json({ error: { code: 'CERTIFICATE_NOT_READY', message: '根证书尚未生成，请稍后重试' } }, { status: 503 }); }
}
