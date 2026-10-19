'use client';
import { useEffect } from 'react';
export function ServiceWorker(){useEffect(()=>{if(!('serviceWorker' in navigator))return;if(process.env.NODE_ENV!=='production'){void navigator.serviceWorker.getRegistrations().then(registrations=>Promise.all(registrations.map(registration=>registration.unregister())));void caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('growth-static-')).map(key=>caches.delete(key))));return;}void navigator.serviceWorker.register('/sw.js');},[]);return null;}
