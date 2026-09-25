import { requireAuth } from '@/lib/auth/context';
import { Avatar, Badge, Card, CardBody, CardHeader, PageHeader } from '@/components/ui';
import { humanize } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile · CampusOS' };

export default async function AdminProfilePage() {
  const user = await requireAuth();
  const permissions = [...user.permissions].sort();

  return (
    <div>
      <PageHeader title="Your profile" />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody className="flex flex-col items-center py-8 text-center">
            <Avatar name={user.fullName} src={user.avatarUrl} size={64} />
            <p className="mt-3 text-[16px] font-semibold text-default">{user.fullName}</p>
            <p className="text-[13px] text-muted">{user.email}</p>
            <Badge tone="brand" className="mt-2">{humanize(user.role)}</Badge>
            <p className="mt-2 text-[12.5px] text-subtle">{user.institutionName}</p>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="What your role permits"
            description="Authorisation is capability-based, so this is the exact list the server checks against."
          />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((p) => (
                <span
                  key={p}
                  className="rounded border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-[11px] text-muted"
                >
                  {p}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-subtle">
              {permissions.length} capabilities granted.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
