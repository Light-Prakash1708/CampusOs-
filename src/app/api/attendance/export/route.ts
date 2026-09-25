import { withAuth } from '@/lib/api';
import { exportAttendanceRows } from '@/services/attendance';
import { studentOf } from '../_lib';

const BOM = '\uFEFF';

function csvCell(v: string | boolean): string {
  const s = String(v);
  // Quote everything; neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** My attendance history as CSV (my records only). */
export const GET = withAuth('attendance:view_own', async (_request, { user }) => {
  const rows = await exportAttendanceRows(studentOf(user));
  const header = ['Date', 'Subject code', 'Subject', 'Status', 'Counts as held', 'Counts as attended', 'Topic', 'Corrected'];
  const lines = [header.map(csvCell).join(','), ...rows.map((r) => [r.date, r.subjectCode, r.subject, r.status, r.countsAsHeld ? 'yes' : 'no', r.countsAsAttended ? 'yes' : 'no', r.topic, r.corrected ? 'yes' : 'no'].map(csvCell).join(','))];
  // UTF-8 byte-order mark so Excel opens non-ASCII names correctly.
  return new Response(`${BOM}${lines.join('\r\n')}\r\n`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="my-attendance-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
