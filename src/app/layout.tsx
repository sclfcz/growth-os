import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorker } from '@/components/service-worker';
export const metadata: Metadata = { title: '个人成长系统', description: '个人成长系统', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, statusBarStyle: 'default', title: '个人成长系统' }, icons: { icon: '/icons/icon.svg', apple: '/icons/icon.svg' } };
export const viewport: Viewport = { themeColor: '#1b7655', width: 'device-width', initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body><ServiceWorker />{children}</body></html>; }
