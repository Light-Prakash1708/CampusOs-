/**
 * Upload validation — pure and unit-tested.
 *
 * The client's declared MIME type and file name are NOT trusted. The type is
 * detected from the file's leading bytes ("magic numbers") and must agree with
 * the extension; the stored MIME type is the detected one. Office documents
 * are ZIP containers, so they are additionally checked for their internal
 * folder (word/, ppt/, xl/).
 */

export type AllowedKind = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'png' | 'jpeg' | 'webp' | 'gif';

export const KIND_INFO: Record<AllowedKind, { mime: string; extensions: string[] }> = {
  pdf: { mime: 'application/pdf', extensions: ['pdf'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extensions: ['docx'] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extensions: ['pptx'] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extensions: ['xlsx'] },
  png: { mime: 'image/png', extensions: ['png'] },
  jpeg: { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  webp: { mime: 'image/webp', extensions: ['webp'] },
  gif: { mime: 'image/gif', extensions: ['gif'] },
};

/** Which kinds each upload purpose accepts. */
export const PURPOSE_KINDS: Record<string, AllowedKind[]> = {
  RESOURCE: ['pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpeg', 'webp'],
  ANNOUNCEMENT: ['pdf', 'docx', 'pptx', 'png', 'jpeg', 'webp'],
  SUBMISSION: ['pdf', 'docx', 'pptx', 'xlsx', 'png', 'jpeg'],
  AVATAR: ['png', 'jpeg', 'webp'],
  EVENT_COVER: ['png', 'jpeg', 'webp'],
};

export const UPLOAD_PURPOSES = Object.keys(PURPOSE_KINDS) as [string, ...string[]];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function containsAscii(bytes: Uint8Array, needle: string, limit = 64 * 1024): boolean {
  const hay = Buffer.from(bytes.subarray(0, Math.min(bytes.length, limit))).toString('latin1');
  if (hay.includes(needle)) return true;
  // The central directory at the end of the ZIP also lists every entry.
  if (bytes.length > limit) {
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - limit))).toString('latin1');
    return tail.includes(needle);
  }
  return false;
}

export function detectKind(bytes: Uint8Array): AllowedKind | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (containsAscii(bytes, 'word/')) return 'docx';
    if (containsAscii(bytes, 'ppt/')) return 'pptx';
    if (containsAscii(bytes, 'xl/')) return 'xlsx';
  }
  return null;
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? m[1]!.toLowerCase() : '';
}

/** Strips paths and control characters; keeps something a human recognises. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  return (clean || 'file').slice(-150);
}

export type ValidationResult =
  | { ok: true; kind: AllowedKind; mime: string; extension: string; name: string }
  | { ok: false; code: 'EMPTY' | 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'TYPE_MISMATCH' | 'BAD_PURPOSE'; message: string };

export function validateUpload(params: {
  name: string;
  bytes: Uint8Array;
  purpose: string;
  maxBytes: number;
}): ValidationResult {
  const allowed = PURPOSE_KINDS[params.purpose];
  if (!allowed) return { ok: false, code: 'BAD_PURPOSE', message: 'Unknown upload purpose.' };
  if (params.bytes.length === 0) return { ok: false, code: 'EMPTY', message: 'The file is empty.' };
  if (params.bytes.length > params.maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `The file is larger than the ${Math.round(params.maxBytes / 1024 / 1024)} MB limit.`,
    };
  }
  const kind = detectKind(params.bytes);
  const allowedList = allowed.map((k) => KIND_INFO[k].extensions[0]!.toUpperCase()).join(', ');
  if (!kind || !allowed.includes(kind)) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: `This type of file can’t be uploaded here. Allowed: ${allowedList}.` };
  }
  const ext = extensionOf(params.name);
  if (!KIND_INFO[kind].extensions.includes(ext)) {
    return {
      ok: false,
      code: 'TYPE_MISMATCH',
      message: `The file’s contents don’t match its .${ext || '?'} extension.`,
    };
  }
  return { ok: true, kind, mime: KIND_INFO[kind].mime, extension: ext, name: sanitizeFileName(params.name) };
}
