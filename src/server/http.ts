import { NextResponse } from 'next/server';
export function apiError(status:number,code:string,message:string){return NextResponse.json({error:{code,message}},{status});}
export function sameOrigin(request:Request):boolean{
 const origin=request.headers.get('origin');if(!origin)return false;
 try{
  const originUrl=new URL(origin);
  const forwarded=request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host=request.headers.get('host')??new URL(request.url).host;
  const expectedHost=forwarded||host;
  const forwardedProto=request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const expectedProto=forwardedProto?`${forwardedProto}:`:new URL(request.url).protocol;
  return originUrl.host===expectedHost&&originUrl.protocol===expectedProto;
 }catch{return false;}
}
