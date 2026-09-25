import QRCode from 'qrcode';
import { AppError, ok, withAuth } from '@/lib/api';
import { getEvent, signPassToken } from '@/services/events';
import { parseId, requireEvents } from '../../_lib';

/**
 * A fresh, short-lived QR for the caller's own confirmed registration. The QR
 * encodes a signed token (10-minute expiry), never the registration id.
 */
export const GET = withAuth(null, async (_r, { user, params }) => {
  requireEvents(user);
  const detail = await getEvent(user, parseId(params.id));
  const reg = detail.registration;
  if (!reg || reg.status !== 'REGISTERED') throw new AppError('You need a confirmed registration to get a pass.', 403, 'NO_PASS');
  const { token, expiresAt } = signPassToken(reg.id);
  const svg = await QRCode.toString(token, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1F1B3D', light: '#FFFFFF' } });
  return ok({ token, expiresAt, code: reg.code, svg });
});
