import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/server/auth';
import { getPartnerStudyStatus, getTogetherPartner, getTogetherPreferences, getUnreadSummary } from '@/server/together';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const response = NextResponse.next();
  const session = await getSession(request, response);
  if (!session.authenticated || !session.username) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '请先登录' } }, { status: 401 });
  const username = session.username;
  const partner = getTogetherPartner(username);
  if (!partner) return NextResponse.json({ paired: false, partner: null });
  const ownPreferences = getTogetherPreferences(username);
  const partnerPreferences = getTogetherPreferences(partner.username);
  const partnerStatus = partnerPreferences.shareStudy || partnerPreferences.shareActivity ? getPartnerStudyStatus(partner) : null;
  const study = partnerPreferences.shareStudy ? partnerStatus?.studySeconds ?? null : null;
  const activity = partnerPreferences.shareActivity ? partnerStatus?.activeActivity ?? null : null;
  const unread = getUnreadSummary(username, partner.username);
  return NextResponse.json({
    paired: true,
    partner: { username: partner.username, nickname: partner.username },
    ownPreferences,
    partnerSharing: partnerPreferences,
    studySeconds: study,
    activeActivity: activity,
    ...unread,
  });
}
