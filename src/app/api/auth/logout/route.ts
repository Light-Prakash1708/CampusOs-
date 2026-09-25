import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/context';
import { clearSessionCookie, revokeSession } from '@/lib/auth/session';
import { recordAudit } from '@/services/audit';

export async function POST() {
  const user = await getCurrentUser();
  if (user) {
    await revokeSession(user.sessionId);
    await recordAudit(user, {
      action: 'USER_LOGOUT',
      entityType: 'user',
      entityId: user.userId,
    });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true, data: { redirectTo: '/login' } });
}
