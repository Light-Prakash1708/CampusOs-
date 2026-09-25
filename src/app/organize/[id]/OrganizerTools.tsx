'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';
import { CampusCard, CampusSectionHeader } from '@/components/campus';

type CheckInResult = { status: string; name?: string; code?: string; message?: string };

/**
 * Check-in desk: type a pass code, or scan the QR with the device camera where
 * the browser supports the BarcodeDetector API (Chrome on Android). Every scan
 * is idempotent server-side — scanning twice never records a second entry.
 */
export function CheckInPanel({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const [result, setResult] = React.useState<CheckInResult | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [scanSupported, setScanSupported] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  React.useEffect(() => {
    setScanSupported('BarcodeDetector' in window && !!navigator.mediaDevices);
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const submit = React.useCallback(
    async (payload: { token?: string; code?: string }) => {
      const res = await fetch(`/api/events/${eventId}/checkin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setResult(json.ok ? json.data : { status: 'INVALID', message: json.error?.message ?? 'Check-in failed.' });
      if (json.ok) router.refresh();
    },
    [eventId, router],
  );

  function stopScan() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function startScan() {
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      let last = '';
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const found = await detector.detect(videoRef.current).catch(() => []);
        const value = found[0]?.rawValue as string | undefined;
        if (value && value !== last) {
          last = value;
          await submit({ token: value });
        }
        if (streamRef.current) requestAnimationFrame(() => void tick());
      };
      void tick();
    } catch {
      setResult({ status: 'INVALID', message: 'Camera unavailable. Type the pass code instead.' });
      stopScan();
    }
  }

  const ok = result && (result.status === 'CHECKED_IN' || result.status === 'ALREADY_CHECKED_IN');
  return (
    <CampusCard className="p-4">
      <CampusSectionHeader title="Check-in" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) void submit({ code: code.trim() });
          setCode('');
        }}
        className="mt-3 flex gap-2"
      >
        <label className="flex-1">
          <span className="sr-only">Pass code</span>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Pass code, e.g. 7K3Q9P"
            className="font-mono tracking-widest"
            maxLength={12}
            autoComplete="off"
          />
        </label>
        <Button type="submit" variant="primary" icon={ScanLine}>
          Check in
        </Button>
      </form>
      {scanSupported ? (
        <div className="mt-3">
          {scanning ? (
            <>
              <video
                ref={videoRef}
                className="aspect-square w-full rounded-xl border-[1.5px] border-ink bg-black object-cover"
                muted
                playsInline
                aria-label="Camera preview for scanning passes"
              />
              <Button className="mt-2 w-full" variant="secondary" onClick={stopScan}>
                Stop camera
              </Button>
            </>
          ) : (
            <Button className="w-full" variant="secondary" icon={Camera} onClick={startScan}>
              Scan QR with camera
            </Button>
          )}
        </div>
      ) : null}
      {result ? (
        <div
          className={`mt-3 flex gap-2 rounded-xl border-[1.5px] border-ink p-3 ${ok ? 'bg-mint' : 'bg-coral'}`}
          role="status"
          aria-live="assertive"
        >
          {ok ? (
            <CheckCircle2 size={18} className="shrink-0 text-mint-ink" aria-hidden />
          ) : (
            <XCircle size={18} className="shrink-0 text-coral-ink" aria-hidden />
          )}
          <div className="text-[13.5px]">
            <p className="font-extrabold text-default">{ok ? result.name : 'Not checked in'}</p>
            <p className="text-muted">
              {result.status === 'CHECKED_IN'
                ? `Welcome! (${result.code})`
                : result.status === 'ALREADY_CHECKED_IN'
                  ? 'Already checked in earlier — no double entry recorded.'
                  : result.message}
            </p>
          </div>
        </div>
      ) : null}
    </CampusCard>
  );
}

export function UpdateComposer({ eventId }: { eventId: string }) {
  const router = useRouter();
  const api = useApi<{ recipients: number }>();
  const [f, setF] = React.useState({ kind: 'GENERAL', title: '', body: '', audience: 'FOLLOWERS' });
  const [sent, setSent] = React.useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const data = await api.call(`/api/events/${eventId}/updates`, { ...f, body: f.body || null });
    if (data) {
      setSent(data.recipients);
      setF({ ...f, title: '', body: '' });
      router.refresh();
    }
  }

  return (
    <CampusCard className="p-4">
      <CampusSectionHeader title="Send an update" />
      <p className="mt-1 text-[12.5px] text-muted">
        One message to everyone who registered or saved the event, delivered by their own notification settings. Venue
        and time changes are marked important.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3">
        <ErrorBox error={api.error} />
        {sent !== null ? (
          <p className="text-[13px] font-bold text-mint-ink" role="status">
            Sent to {sent} {sent === 1 ? 'person' : 'people'}.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Type" htmlFor="up-kind">
            <Select id="up-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              <option value="GENERAL">General</option>
              <option value="REMINDER">Reminder</option>
              <option value="VENUE_CHANGED">Venue changed</option>
              <option value="TIME_CHANGED">Time changed</option>
              <option value="RESULTS">Results</option>
              <option value="CERTIFICATES">Certificates</option>
              <option value="EMERGENCY">Emergency</option>
            </Select>
          </Field>
          <Field label="Send to" htmlFor="up-aud">
            <Select id="up-aud" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
              <option value="FOLLOWERS">Registered + saved</option>
              <option value="REGISTERED">Registered only</option>
            </Select>
          </Field>
        </div>
        <Field label="Title" htmlFor="up-title">
          <Input id="up-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} />
        </Field>
        <Field label="Message" htmlFor="up-body">
          <Textarea id="up-body" rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={2000} />
        </Field>
        <Button type="submit" variant="primary" loading={api.loading} disabled={f.title.trim().length < 3} className="w-full">
          Send update
        </Button>
      </form>
    </CampusCard>
  );
}

export function CertificatesAction({ eventId, eligible }: { eventId: string; eligible: number }) {
  const router = useRouter();
  const api = useApi<{ issued: number }>();
  const [issued, setIssued] = React.useState<number | null>(null);
  return (
    <CampusCard className="p-4">
      <CampusSectionHeader title="Certificates" />
      <p className="mt-1 text-[12.5px] text-muted">Issued only to attendees who checked in. Each gets a public verification ID.</p>
      <ErrorBox error={api.error} />
      {issued !== null ? (
        <p className="mt-2 text-[13px] font-bold text-mint-ink" role="status">
          Issued {issued} certificate{issued === 1 ? '' : 's'}.
        </p>
      ) : null}
      <Button
        className="mt-3 w-full"
        variant="primary"
        disabled={eligible === 0}
        loading={api.loading}
        onClick={async () => {
          const d = await api.call(`/api/events/${eventId}/certificates`, { kind: 'PARTICIPATION' });
          if (d) {
            setIssued(d.issued);
            router.refresh();
          }
        }}
      >
        {eligible === 0 ? 'No new attendees to certify' : `Issue ${eligible} participation certificate${eligible === 1 ? '' : 's'}`}
      </Button>
    </CampusCard>
  );
}

export function AttendeeDecision({ eventId, registrationId }: { eventId: string; registrationId: string }) {
  const router = useRouter();
  const api = useApi();
  const decide = async (approve: boolean) => {
    const d = await api.call(`/api/events/${eventId}/attendees/${registrationId}`, { approve });
    if (d) router.refresh();
  };
  return (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => decide(false)} loading={api.loading}>
        Decline
      </Button>
      <Button size="sm" variant="primary" onClick={() => decide(true)} loading={api.loading}>
        Approve
      </Button>
    </span>
  );
}

/**
 * Cancel an event. Needs a reason (shown to attendees), and a second click to
 * confirm — registered and following students are notified.
 */
export function CancelEventAction({ eventId, live }: { eventId: string; live: boolean }) {
  const router = useRouter();
  const api = useApi<{ id: string; status: string }>();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="min-h-[44px]">
        <XCircle size={15} aria-hidden /> Cancel event
      </Button>
    );
  }
  return (
    <CampusCard className="w-full space-y-3 p-4 sm:max-w-md">
      <Field label="Why is it cancelled?" htmlFor="cancel-reason" hint={live ? 'Everyone registered or following gets this message.' : 'Kept with the event record.'}>
        <Textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
      </Field>
      <ErrorBox error={api.error} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          loading={api.loading}
          disabled={reason.trim().length < 5}
          onClick={async () => {
            const res = await api.call(`/api/events/${eventId}/cancel`, { reason: reason.trim() });
            if (res) {
              setOpen(false);
              router.refresh();
            }
          }}
          className="min-h-[44px]"
        >
          Confirm cancellation
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} className="min-h-[44px]">
          Keep the event
        </Button>
      </div>
    </CampusCard>
  );
}
