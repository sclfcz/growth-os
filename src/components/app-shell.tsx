'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookHeart, BookOpen, Dumbbell, Home, LogOut, Moon, Settings, Sun, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TogetherMessenger } from '@/components/together';

const tabs = [
  { href: '/', label: '今日', Icon: Home },
  { href: '/study', label: '学习', Icon: BookOpen },
  { href: '/fitness', label: '健身', Icon: Dumbbell },
  { href: '/money', label: '记账', Icon: Wallet },
  { href: '/journal', label: '复盘', Icon: BookHeart },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem('growth-theme');
    const selected = stored === 'dark' ? 'dark' : 'light';
    setTheme(selected);
    document.documentElement.dataset.theme = selected;
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('growth-theme', next);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  const ThemeIcon = theme === 'light' ? Moon : Sun;
  const themeLabel = theme === 'light' ? '黑夜模式' : '白天模式';
  const themeButton = <button className="theme-switch" onClick={toggleTheme}><ThemeIcon size={18} aria-hidden="true"/><span>{themeLabel}</span></button>;

  return <div className="app-layout">
    <header className="mobile-head">
      <Link className="brand" href="/"><span className="brand-icon">G</span> 个人成长系统</Link>
      <details><summary aria-label="打开菜单">•••</summary><div className="mobile-menu">
        <Link href="/goals">目标</Link><Link href="/stats">统计</Link><Link href="/settings">设置</Link>
        {themeButton}<button onClick={logout}>退出登录</button>
      </div></details>
    </header>
    <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-icon">G</span> 个人成长系统</Link>
      <nav>{tabs.map(({ href, label, Icon }) => <Link key={href} className={path === href ? 'active' : ''} href={href}><Icon size={19}/>{label}</Link>)}</nav>
      <div className="side-bottom"><Link href="/settings"><Settings size={18}/>设置</Link>{themeButton}<button onClick={logout}><LogOut size={18}/>退出登录</button></div>
    </aside>
    <main className="main-area">{children}</main>
    <TogetherMessenger />
    <nav className="bottom-tabs">{tabs.map(({ href, label, Icon }) => <Link key={href} className={path === href ? 'active' : ''} href={href}><Icon size={21}/><span>{label}</span></Link>)}</nav>
  </div>;
}
