'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function LoginPage() {
 const [username,setUsername]=useState(''); const [password,setPassword]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const router=useRouter();
 async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})}); const result=await response.json() as {error?:{message:string}}; if (!response.ok) throw new Error(result.error?.message ?? '登录失败'); router.replace('/'); } catch(e) { setError(e instanceof Error ? e.message : '登录失败'); } finally { setBusy(false); } }
 return <main className="login-wrap"><form className="login-card" onSubmit={submit}><div className="brand-icon">G</div><p className="eyebrow">个人成长系统</p><h1>欢迎回来</h1><label htmlFor="username">账号</label><input id="username" name="username" type="text" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)} placeholder="输入账号"/><label htmlFor="password">密码</label><input id="password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="输入密码"/><button disabled={busy}>{busy?'正在验证…':'进入系统'}</button>{error&&<p role="alert" className="error">{error}</p>}</form></main>;
}
