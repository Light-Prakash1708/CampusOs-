import 'server-only';

/**
 * FILE STORAGE — DOCUMENTED GAP
 * ---------------------------------------------------------------------------
 * `.env` declares STORAGE_PROVIDER / STORAGE_BUCKET, but this build ships no
 * adapter that implements them: there is no `src/services/storage` module and
 * nothing writes bytes anywhere.
 *
 * The product rule ("never claim success that did not happen") means we do NOT
 * accept a file, show a progress bar and write a resource row whose file_url
 * points at nothing. Instead:
 *
 *   - the upload control is rendered disabled, with this explanation visible
 *   - the API refuses a file payload with 501 STORAGE_NOT_CONFIGURED
 *   - link-backed resources work fully, because a URL needs no storage
 *
 * To close the gap, add a storage service exposing `put(file) -> { url, size,
 * mimeType }` and flip STORAGE_AVAILABLE to read from it.
 */
export const STORAGE_AVAILABLE = false;

export const STORAGE_LIMITATION =
  'This deployment has no file-storage adapter, so CampusOS cannot accept a file. Add the resource as a link to where the file already lives (Drive, SharePoint, the LMS), or ask your administrator to configure storage.';
