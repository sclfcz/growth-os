import { NextRequest, NextResponse } from 'next/server';
export function middleware(request: NextRequest) {
 const path = request.nextUrl.pathname;
 if (path === '/api/health' || path === '/login' || path.startsWith('/api/auth/')) return security(NextResponse.next());
 const hasSession = Boolean(request.cookies.get('growth_session')?.value);
 if (!hasSession) {
  if (path.startsWith('/api/')) return security(NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 }));
  return security(NextResponse.redirect(new URL('/login', request.url)));
 }
 if (path.startsWith('/api/') && ['POST','PUT','PATCH','DELETE'].includes(request.method)) {
  const origin=request.headers.get('origin');
  let originHost='';try{originHost=origin?new URL(origin).host:'';}catch{originHost='';}
  const expectedHost=request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()||request.headers.get('host')||request.nextUrl.host;
  if(!originHost||originHost!==expectedHost)return security(NextResponse.json({error:{code:'INVALID_ORIGIN',message:'请求来源校验失败'}},{status:403}));
 }
 return security(NextResponse.next());
}
function security(response: NextResponse) {
 response.headers.set('X-Frame-Options', 'DENY');
 response.headers.set('X-Content-Type-Options', 'nosniff');
 response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
 response.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; manifest-src 'self'; worker-src 'self'");
 if (process.env.ACCESS_MODE === 'domain') response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
 return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'] };
