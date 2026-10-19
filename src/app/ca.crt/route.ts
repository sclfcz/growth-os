import { NextRequest } from 'next/server';
import { GET as downloadCertificate } from '@/app/api/ca/route';
export const dynamic='force-dynamic';
export async function GET(request: NextRequest) { return downloadCertificate(request); }
