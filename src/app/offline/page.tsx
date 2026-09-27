export const metadata = { title: 'Offline · CampusOS' };
export const dynamic = 'force-static';

/** Shown by the service worker when there is no connection. Contains no personal data. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-sunken px-4">
      <div className="max-w-sm rounded-2xl border border-[hsl(var(--border))] bg-surface p-6 text-center">
        <h1 className="font-display text-[22px] font-extrabold text-default">You’re offline</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          CampusOS needs a connection to show your timetable, attendance and notices — we don’t keep copies of them on this device. Try again when you’re back online.
        </p>
        <a href="/" className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-[14px] font-bold text-white">Try again</a>
      </div>
    </main>
  );
}
