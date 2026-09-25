import 'server-only';
import { storageAvailable, STORAGE_UNAVAILABLE_MESSAGE } from '@/services/storage';

/**
 * Compatibility shim for v1 call sites. Storage is now provided by
 * src/services/storage (local / S3-compatible / Supabase). When no provider is
 * configured the upload control is hidden and this message explains why.
 */
export const STORAGE_AVAILABLE = storageAvailable();
export const STORAGE_LIMITATION = STORAGE_UNAVAILABLE_MESSAGE;
export { storageAvailable };
