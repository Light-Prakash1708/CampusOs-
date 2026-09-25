import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { exportPersonalData } from '@/services/privacy';

/** Downloads a JSON copy of the caller's personal data (DPDP right of access). */
export const GET = withAuth('privacy:manage_own', async (request, { user }) => {
  const data = await exportPersonalData(user, metaFrom(request));
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="campusos-my-data-${date}.json"`,
      'cache-control': 'no-store',
    },
  });
});
