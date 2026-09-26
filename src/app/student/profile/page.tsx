import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { GraduationCap, Info, Mail, Phone, ShieldQuestion, Users } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from '@/components/ui';
import { formatDate, humanize, num } from '@/lib/utils';
import { requireStudentContext } from '../_lib/auth';
import { getCurrentTerm } from '../_lib/student';
import { MembershipCard } from '../_components/MembershipCard';

export const metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await requireStudentContext();

  const [profile] = await db
    .select({
      rollNumber: t.studentProfiles.rollNumber,
      admissionNumber: t.studentProfiles.admissionNumber,
      currentYear: t.studentProfiles.currentYear,
      currentSemester: t.studentProfiles.currentSemester,
      admissionDate: t.studentProfiles.admissionDate,
      expectedGraduation: t.studentProfiles.expectedGraduation,
      dateOfBirth: t.studentProfiles.dateOfBirth,
      gender: t.studentProfiles.gender,
      bloodGroup: t.studentProfiles.bloodGroup,
      guardianName: t.studentProfiles.guardianName,
      guardianPhone: t.studentProfiles.guardianPhone,
      guardianEmail: t.studentProfiles.guardianEmail,
      cgpa: t.studentProfiles.cgpa,
      phone: t.users.phone,
      programName: t.programs.name,
      programCode: t.programs.code,
      programLevel: t.programs.level,
      departmentName: t.departments.name,
      campusName: t.campuses.name,
    })
    .from(t.studentProfiles)
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .innerJoin(t.programs, eq(t.programs.id, t.studentProfiles.programId))
    .leftJoin(t.departments, eq(t.departments.id, t.programs.departmentId))
    .leftJoin(t.campuses, eq(t.campuses.id, t.users.campusId))
    .where(eq(t.studentProfiles.id, user.studentProfileId))
    .limit(1);

  const [section] = user.sectionId
    ? await db
        .select({
          name: t.sections.name,
          code: t.sections.code,
          year: t.sections.year,
          semester: t.sections.semester,
          advisorFirst: t.users.firstName,
          advisorLast: t.users.lastName,
        })
        .from(t.sections)
        .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.sections.facultyAdvisorId))
        .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
        .where(eq(t.sections.id, user.sectionId))
        .limit(1)
    : [undefined];

  const [goal] = await db
    .select({ title: t.careerRoles.title, targetDate: t.careerGoals.targetDate })
    .from(t.careerGoals)
    .innerJoin(t.careerRoles, eq(t.careerRoles.id, t.careerGoals.careerRoleId))
    .where(eq(t.careerGoals.studentId, user.studentProfileId))
    .limit(1);

  const term = await getCurrentTerm(user.institutionId);

  return (
    <>
      <PageHeader
        title="Profile"
        description="Your official record as the institution holds it."
      />

      <Card className="mb-5">
        <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={user.fullName} src={user.avatarUrl} size={64} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-default">
              {user.fullName}
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {profile?.programName}
              {section ? ` · Section ${section.name}` : ''}
              {profile ? ` · Year ${profile.currentYear}, Semester ${profile.currentSemester}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} className="text-subtle" aria-hidden />
                {user.email}
              </span>
              {profile?.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone size={13} className="text-subtle" aria-hidden />
                  {profile.phone}
                </span>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="font-mono text-[13px] font-semibold text-default">
              {profile?.rollNumber}
            </p>
            <p className="text-[11.5px] text-subtle">Roll number</p>
          </div>
        </CardBody>
      </Card>

      <MembershipCard user={user} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Academic record" icon={GraduationCap} />
          <CardBody>
            <dl className="space-y-2.5 text-[13px]">
              <Row label="Programme" value={`${profile?.programName ?? '—'} (${profile?.programCode ?? '—'})`} />
              <Row label="Level" value={humanize(profile?.programLevel ?? '')} />
              <Row label="Department" value={profile?.departmentName ?? '—'} />
              <Row label="Campus" value={profile?.campusName ?? '—'} />
              <Row
                label="Section"
                value={section ? `${section.name} (${section.code})` : 'Not assigned'}
              />
              <Row
                label="Faculty advisor"
                value={
                  section?.advisorFirst
                    ? `${section.advisorFirst} ${section.advisorLast ?? ''}`.trim()
                    : 'Not assigned'
                }
              />
              <Row label="Current term" value={term?.name ?? 'No active term'} />
              <Row label="Admission number" value={profile?.admissionNumber ?? '—'} />
              <Row label="Admitted" value={formatDate(profile?.admissionDate)} />
              <Row label="Expected graduation" value={formatDate(profile?.expectedGraduation)} />
              <Row
                label="CGPA"
                value={
                  profile?.cgpa ? (
                    <span className="tabular font-medium text-default">{num(profile.cgpa, 2)}</span>
                  ) : (
                    'Not published'
                  )
                }
              />
            </dl>
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Personal & emergency" icon={Users} />
            <CardBody>
              <dl className="space-y-2.5 text-[13px]">
                <Row label="Date of birth" value={formatDate(profile?.dateOfBirth)} />
                <Row label="Gender" value={profile?.gender ? humanize(profile.gender) : '—'} />
                <Row label="Blood group" value={profile?.bloodGroup ?? '—'} />
                <Row label="Guardian" value={profile?.guardianName ?? '—'} />
                <Row label="Guardian phone" value={profile?.guardianPhone ?? '—'} />
                <Row label="Guardian email" value={profile?.guardianEmail ?? '—'} />
              </dl>
            </CardBody>
          </Card>

          {goal ? (
            <Card>
              <CardHeader title="Career goal" />
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-medium text-default">{goal.title}</p>
                  {goal.targetDate ? (
                    <p className="text-[12.5px] text-muted">
                      Target {formatDate(goal.targetDate)}
                    </p>
                  ) : null}
                </div>
                <Button asChild size="sm" variant="secondary">
                  <Link href="/student/skills">Readiness</Link>
                </Button>
              </CardBody>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Account" />
            <CardBody>
              <dl className="space-y-2.5 text-[13px]">
                <Row label="Role" value={<Badge tone="brand">{humanize(user.role)}</Badge>} />
                <Row label="Institution" value={user.institutionName} />
                <Row label="Language" value={user.locale.toUpperCase()} />
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      <Alert className="mt-5" tone="info" icon={Info} title="Something here wrong?">
        This record is maintained by the administration office, so it is read-only for you. Raise a
        case and the correction is applied by the office with an audit trail.
        <span className="mt-2 block">
          <Button asChild size="sm" variant="secondary" icon={ShieldQuestion}>
            <Link href="/student/redressal/new?category=fees-admin">Request a correction</Link>
          </Button>
        </span>
      </Alert>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-default">{value}</dd>
    </div>
  );
}
