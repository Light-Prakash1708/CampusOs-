import { redirect } from 'next/navigation';

/** Library & Resources lives at /student/resources until the library module lands (UI Phase 5). */
export default function LibraryPage() {
  redirect('/student/resources');
}
