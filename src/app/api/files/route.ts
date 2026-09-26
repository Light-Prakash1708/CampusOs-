import { z } from 'zod';
import { AppError, ok, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { uploadFile } from '@/services/storage';
import { maxUploadBytes } from '@/services/storage/providers';
import { UPLOAD_PURPOSES } from '@/services/storage/validate';

export const runtime = 'nodejs';

/** multipart/form-data: `file` + `purpose`. Returns the stored file's id and URL. */
export const POST = withAuth('file:upload', async (request, { user }) => {
  // Browsers always send Content-Length for form uploads; refusing bodies without
  // one stops a chunked upload from slipping past the size check below.
  const declaredHeader = request.headers.get('content-length');
  if (!declaredHeader) throw new AppError('Upload size unknown. Send the file with a Content-Length.', 411, 'LENGTH_REQUIRED');
  const declared = Number(declaredHeader);
  // Refuse obviously oversized bodies before buffering them (multipart overhead allowance: 64 KB).
  if (declared > maxUploadBytes() + 64 * 1024) {
    throw new AppError(`The file is larger than the ${Math.round(maxUploadBytes() / 1024 / 1024)} MB limit.`, 413, 'TOO_LARGE');
  }
  const form = await request.formData().catch(() => {
    throw new AppError('Send the file as multipart/form-data.', 400, 'BAD_FORM');
  });
  const file = form.get('file');
  const purpose = z.enum(UPLOAD_PURPOSES).parse(form.get('purpose'));
  if (!(file instanceof File)) throw new AppError('Attach a file.', 422, 'NO_FILE');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await uploadFile(user, { name: file.name, bytes, purpose, meta: metaFrom(request) });
  return ok(stored, { status: 201 });
});
