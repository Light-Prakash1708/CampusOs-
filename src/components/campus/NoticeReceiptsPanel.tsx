import { CheckCircle2, Download, Users } from "lucide-react";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Progress,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { formatDateTime, humanize, pluralize } from "@/lib/utils";
import type { NoticeReceipts } from "@/services/notice-receipts";

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * Verified communication: the proof panel for one notice. Sent → delivered →
 * read → acknowledged, then exactly who still needs to confirm.
 */
export function NoticeReceiptsPanel({
  r,
  part = "all",
}: {
  r: NoticeReceipts;
  part?: "all" | "delivery" | "pending";
}) {
  const f = r.funnel;
  const rows: { label: string; value: number; hint: string }[] = [
    {
      label: "Sent",
      value: f.recipients,
      hint: "People this notice was addressed to",
    },
    {
      label: "Delivered in CampusOS",
      value: f.deliveredInApp,
      hint: "Appeared in their CampusOS notifications",
    },
    { label: "Opened", value: f.read, hint: "Opened the notice at least once" },
    ...(r.requiresAcknowledgement
      ? [
          {
            label: "Acknowledged",
            value: f.acknowledged,
            hint: "Confirmed they have read it",
          },
        ]
      : []),
  ];
  const external = (["email", "push", "sms", "whatsapp"] as const).filter(
    (c) => {
      const x = r.channels[c];
      return x.sent + x.failed + x.skipped + x.queued > 0;
    },
  );

  const showDelivery = part !== "pending";
  const showPending = part !== "delivery";
  return (
    <div className="space-y-5">
      {showDelivery ? (
        <Card>
          <CardHeader
            title="Delivery proof"
            description="Counted from each recipient’s own record — the same numbers appear in Evidence & Reports."
          />
          <CardBody className="space-y-3">
            {rows.map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-muted" title={row.hint}>
                    {row.label}
                  </span>
                  <span className="tabular font-semibold text-default">
                    {row.value.toLocaleString("en-IN")}
                    {row.label !== "Sent" ? (
                      <span className="ml-1 font-normal text-subtle">
                        ({pct(row.value, f.recipients)}%)
                      </span>
                    ) : null}
                  </span>
                </div>
                {row.label !== "Sent" ? (
                  <Progress
                    value={pct(row.value, f.recipients)}
                    tone={
                      pct(row.value, f.recipients) > 80
                        ? "success"
                        : pct(row.value, f.recipients) > 55
                          ? "warning"
                          : "danger"
                    }
                    className="mt-1.5"
                  />
                ) : null}
              </div>
            ))}
            {r.requiresAcknowledgement ? (
              <p className="text-[12.5px] text-subtle">
                {f.pending.toLocaleString("en-IN")} pending
                {r.deadline ? ` · deadline ${formatDateTime(r.deadline)}` : ""}
                {r.reminderSentAt
                  ? ` · reminder sent ${formatDateTime(r.reminderSentAt)}`
                  : ""}
              </p>
            ) : null}
            {external.length ? (
              <div className="border-t border-[hsl(var(--border))] pt-3">
                <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-subtle">
                  Other channels
                </p>
                <ul className="space-y-1 text-[12.5px] text-muted">
                  {external.map((c) => (
                    <li key={c}>
                      <span className="font-medium text-default">
                        {humanize(c)}:
                      </span>{" "}
                      {r.channels[c].sent} sent
                      {r.channels[c].failed
                        ? ` · ${r.channels[c].failed} failed`
                        : ""}
                      {r.channels[c].skipped
                        ? ` · ${r.channels[c].skipped} skipped (preferences or provider off)`
                        : ""}
                      {r.channels[c].queued
                        ? ` · ${r.channels[c].queued} queued`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {showDelivery && r.requiresAcknowledgement && f.overdue ? (
        <Alert tone="warning" title="Deadline passed">
          {pluralize(f.pending, "person", "people")} did not acknowledge before
          the deadline. Follow up with the people listed rather than
          re-broadcasting to everyone.
        </Alert>
      ) : null}

      {showPending ? (
        <Card>
          <CardHeader
            title="Not yet acknowledged"
            icon={Users}
            description={
              r.requiresAcknowledgement
                ? `${f.pending} of ${f.recipients} have not confirmed`
                : "This notice does not ask people to confirm"
            }
            action={
              r.requiresAcknowledgement && f.pending > 0 ? (
                <a
                  href={`/api/announcements/${r.id}/receipts?format=csv`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[hsl(var(--border-strong))] bg-surface px-3 text-[13px] font-medium text-default hover:bg-surface-sunken"
                >
                  <Download size={14} aria-hidden /> CSV
                </a>
              ) : null
            }
          />
          {!r.requiresAcknowledgement ? (
            <EmptyState
              title="Acknowledgement was not required"
              description="Opens are still counted, but nobody was asked to confirm."
            />
          ) : r.pending.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Everyone has acknowledged"
              description="All recipients confirmed they read this notice."
            />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Section</Th>
                    <Th>Opened?</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.pending.slice(0, 100).map((p) => (
                    <tr key={p.userId}>
                      <Td>
                        <span className="block text-[13.5px] text-default">
                          {p.name}
                        </span>
                        <span className="block text-[11.5px] text-subtle">
                          {p.rollNumber ?? humanize(p.role)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12.5px] text-muted">
                          {p.sectionCode ?? "—"}
                        </span>
                      </Td>
                      <Td>
                        {p.readAt ? (
                          <Badge tone="warning">Opened, not confirmed</Badge>
                        ) : (
                          <Badge tone="neutral">Not opened</Badge>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {r.pending.length > 100 ? (
                <CardBody className="pt-0">
                  <p className="text-[12.5px] text-subtle">
                    and {r.pending.length - 100} more — download the CSV for the
                    full list.
                  </p>
                </CardBody>
              ) : null}
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
