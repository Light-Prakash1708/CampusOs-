/**
 * CampusOS — demo institution seed
 * ---------------------------------------------------------------------------
 * Creates "Kolkata Business Institute" (fictional demo college): five departments, five programmes, eight
 * sections, ~336 students, 24 faculty, a real solver-generated timetable, five
 * weeks of attendance, live assignments, announcements with acknowledgement
 * state, open grievance cases (including one about to breach SLA), skill
 * profiles and workload records.
 *
 * The data is deliberately realistic — not "Student 1, Student 2" — because a
 * demo with plausible data surfaces real product problems, and because a
 * college evaluating CampusOS should see something that looks like their own
 * institution.
 *
 * Safe to re-run: it truncates the demo tenant first.
 */
// Must be first: loads .env before any module reads process.env.
import 'dotenv/config';

import { sql, eq } from 'drizzle-orm';
import { db, pool } from '../src/lib/db';
import * as s from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/auth/password';
import { defaultFlags } from '../src/lib/features';
import { purgeTenant } from './lib/purge';
import { seedEventsNetwork } from './seed-events';
import { ensureRetentionPolicies } from '../src/services/privacy/retention';
import { defaultSolver } from '../src/services/timetable/solver';
import type { SolverSession, SolverInput } from '../src/services/timetable/types';

/* ----------------------------- deterministic RNG --------------------------- */

let seedState = 20260820;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}
function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function chance(p: number): boolean {
  return rand() < p;
}

/* --------------------------------- names ---------------------------------- */

const FIRST_F = ['Ananya','Priya','Sneha','Kavya','Divya','Meera','Riya','Aditi','Neha','Pooja','Shreya','Ishita','Tanvi','Nandini','Aishwarya','Lakshmi','Swati','Rhea','Anjali','Sanjana','Bhavna','Charu','Deepika','Gauri','Harini'];
const FIRST_M = ['Arjun','Rohan','Aditya','Karan','Vikram','Rahul','Siddharth','Aryan','Nikhil','Varun','Rajat','Sameer','Kabir','Dhruv','Manish','Pranav','Yash','Harsh','Abhishek','Ritesh','Gaurav','Tarun','Vivek','Naveen','Sagar'];
const LAST = ['Sharma','Iyer','Nair','Patel','Reddy','Menon','Gupta','Verma','Singh','Kulkarni','Desai','Joshi','Rao','Chatterjee','Banerjee','Mukherjee','Pillai','Bhat','Shetty','Kapoor','Malhotra','Bose','Ghosh','Trivedi','Mishra','Agarwal','Chauhan','Saxena'];

function personName(): { first: string; last: string; gender: string } {
  const female = chance(0.48);
  return {
    first: female ? pick(FIRST_F) : pick(FIRST_M),
    last: pick(LAST),
    gender: female ? 'F' : 'M',
  };
}

/* ------------------------------ helpers ----------------------------------- */

async function insertChunked<T>(
  table: never,
  rows: T[],
  size = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.insert(table as any).values(rows.slice(i, i + size) as any);
  }
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

const DEMO_SLUG = 'demo-university';

/* ================================== MAIN ================================== */

async function main() {
  const startedAt = Date.now();
  console.log('CampusOS seed — starting');

  const demoPassword = process.env.DEMO_PASSWORD ?? 'CampusOS!Demo2026';
  const passwordHash = await hashPassword(demoPassword);

  /* ---------- reset the demo tenant ---------- */
  const existing = await db
    .select({ id: s.institutions.id })
    .from(s.institutions)
    .where(eq(s.institutions.slug, DEMO_SLUG))
    .limit(1);

  if (existing[0]) {
    console.log('  · removing previous demo tenant');

    await purgeTenant(db, existing[0].id);
  }

  /* ---------- institution ---------- */
  const [institution] = await db
    .insert(s.institutions)
    .values({
      slug: DEMO_SLUG,
      name: 'Kolkata Business Institute',
      shortName: 'KBI',
      primaryColor: '#4F46E5',
      timezone: 'Asia/Kolkata',
      contactEmail: 'office@kbi.demo.campusos.local',
      contactPhone: '+91 33 4000 1000',
      city: 'Kolkata',
      state: 'West Bengal',
      subscriptionTier: 'PROFESSIONAL',
      featureFlags: { ...defaultFlags(), anonymous_grievance_enabled: true, personal_tracker_enabled: true, gamification_enabled: true, leaderboards_enabled: true },
      registrationPolicy: { mode: 'ADMIN_APPROVAL' },
      isListed: true,
      setupCompletedAt: new Date(),
    })
    .returning();
  const inst = institution!.id;
  console.log('  · institution created');

  const [campus] = await db
    .insert(s.campuses)
    .values({
      institutionId: inst,
      name: 'Main Campus',
      code: 'MAIN',
      city: 'Kolkata',
      isPrimary: true,
    })
    .returning();

  /* ---------- departments ---------- */
  const deptDefs = [
    { code: 'MGT', name: 'Management Studies', school: 'School of Business' },
    { code: 'CSA', name: 'Computer Applications', school: 'School of Computing' },
    { code: 'BIO', name: 'Biotechnology', school: 'School of Life Sciences' },
    { code: 'ENG', name: 'Engineering', school: 'School of Engineering' },
    { code: 'COM', name: 'Commerce', school: 'School of Business' },
  ];
  const departments = await db
    .insert(s.departments)
    .values(
      deptDefs.map((d) => ({
        institutionId: inst,
        campusId: campus!.id,
        name: d.name,
        code: d.code,
        school: d.school,
        email: `${d.code.toLowerCase()}@demo.campusos.local`,
      })),
    )
    .returning();
  const dept = Object.fromEntries(departments.map((d) => [d.code, d.id]));

  /* ---------- programmes ---------- */
  const programDefs = [
    { code: 'BBA-FIN', name: 'BBA Finance', dept: 'MGT', years: 3, sems: 6 },
    { code: 'BBA-BA', name: 'BBA Business Analytics', dept: 'MGT', years: 3, sems: 6 },
    { code: 'BCA', name: 'Bachelor of Computer Applications', dept: 'CSA', years: 3, sems: 6 },
    { code: 'BTECH-BIO', name: 'B.Tech Biotechnology', dept: 'BIO', years: 4, sems: 8 },
    { code: 'BCOM', name: 'B.Com (Hons)', dept: 'COM', years: 3, sems: 6 },
  ];
  const programs = await db
    .insert(s.programs)
    .values(
      programDefs.map((p) => ({
        institutionId: inst,
        departmentId: dept[p.dept]!,
        name: p.name,
        code: p.code,
        level: 'UG',
        durationYears: p.years,
        totalSemesters: p.sems,
      })),
    )
    .returning();
  const prog = Object.fromEntries(programs.map((p) => [p.code, p.id]));

  /* ---------- academic year + term ---------- */
  const [year] = await db
    .insert(s.academicYears)
    .values({
      institutionId: inst,
      label: '2026-27',
      startDate: '2026-06-01',
      endDate: '2027-05-31',
      isCurrent: true,
    })
    .returning();

  const [term] = await db
    .insert(s.terms)
    .values({
      institutionId: inst,
      academicYearId: year!.id,
      name: 'Odd Semester 2026-27',
      semesterNumber: 3,
      startDate: '2026-06-15',
      endDate: '2026-11-15',
      teachingEndDate: '2026-10-25',
      isCurrent: true,
    })
    .returning();

  /* ---------- holidays ---------- */
  await db.insert(s.holidays).values([
    { institutionId: inst, name: 'Independence Day', date: '2026-08-15' },
    { institutionId: inst, name: 'Ganesh Chaturthi', date: '2026-09-14' },
    { institutionId: inst, name: 'Gandhi Jayanti', date: '2026-10-02' },
    { institutionId: inst, name: 'Dussehra', date: '2026-10-20' },
    { institutionId: inst, name: 'Founders Day', date: '2026-09-05', isHalfDay: true },
  ]);

  /* ---------- time slots ---------- */
  const periodDefs = [
    { position: 1, start: '09:00', end: '09:55', kind: 'TEACHING' as const, label: 'Period 1' },
    { position: 2, start: '10:00', end: '10:55', kind: 'TEACHING' as const, label: 'Period 2' },
    { position: 3, start: '11:00', end: '11:55', kind: 'TEACHING' as const, label: 'Period 3' },
    { position: 4, start: '12:00', end: '12:45', kind: 'LUNCH' as const, label: 'Lunch' },
    { position: 5, start: '12:50', end: '13:45', kind: 'TEACHING' as const, label: 'Period 4' },
    { position: 6, start: '13:50', end: '14:45', kind: 'TEACHING' as const, label: 'Period 5' },
    { position: 7, start: '14:50', end: '15:45', kind: 'TEACHING' as const, label: 'Period 6' },
    { position: 8, start: '15:50', end: '16:45', kind: 'TEACHING' as const, label: 'Period 7' },
  ];
  const weekDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] as const;

  const slotRows: (typeof s.timeSlots.$inferInsert)[] = weekDays.flatMap((day) =>
    periodDefs.map((p) => ({
      institutionId: inst,
      label: `${day.slice(0, 3)} ${p.label}`,
      dayOfWeek: day,
      startTime: p.start,
      endTime: p.end,
      kind: p.kind,
      position: p.position,
    })),
  );
  // Saturday: morning only.
  slotRows.push(
    ...periodDefs.slice(0, 3).map((p) => ({
      institutionId: inst,
      label: `SAT ${p.label}`,
      dayOfWeek: 'SATURDAY' as const,
      startTime: p.start,
      endTime: p.end,
      kind: p.kind,
      position: p.position,
    })),
  );
  const timeSlots = await db.insert(s.timeSlots).values(slotRows).returning();
  console.log(`  · ${timeSlots.length} time slots`);

  /* ---------- rooms ---------- */
  const roomDefs = [
    { code: '101', type: 'CLASSROOM', capacity: 60, building: 'Academic Block A', floor: '1' },
    { code: '102', type: 'CLASSROOM', capacity: 60, building: 'Academic Block A', floor: '1' },
    { code: '103', type: 'CLASSROOM', capacity: 50, building: 'Academic Block A', floor: '1' },
    { code: '201', type: 'CLASSROOM', capacity: 60, building: 'Academic Block A', floor: '2' },
    { code: '202', type: 'CLASSROOM', capacity: 55, building: 'Academic Block A', floor: '2' },
    { code: '203', type: 'CLASSROOM', capacity: 50, building: 'Academic Block A', floor: '2' },
    { code: '204', type: 'CLASSROOM', capacity: 45, building: 'Academic Block A', floor: '2' },
    { code: '301', type: 'CLASSROOM', capacity: 70, building: 'Academic Block B', floor: '3' },
    { code: '302', type: 'CLASSROOM', capacity: 60, building: 'Academic Block B', floor: '3' },
    { code: '303', type: 'CLASSROOM', capacity: 50, building: 'Academic Block B', floor: '3' },
    { code: 'LAB-A', type: 'LAB', capacity: 45, building: 'Computing Block', floor: '1' },
    { code: 'LAB-B', type: 'LAB', capacity: 45, building: 'Computing Block', floor: '1' },
    { code: 'LAB-BIO', type: 'LAB', capacity: 40, building: 'Life Sciences', floor: '2' },
    { code: 'SEM-1', type: 'SEMINAR_HALL', capacity: 120, building: 'Academic Block B', floor: 'G' },
    { code: 'AUD', type: 'AUDITORIUM', capacity: 400, building: 'Main Building', floor: 'G' },
  ];
  const rooms = await db
    .insert(s.rooms)
    .values(
      roomDefs.map((r) => ({
        institutionId: inst,
        campusId: campus!.id,
        code: r.code,
        name: r.type === 'LAB' ? `Laboratory ${r.code}` : `Room ${r.code}`,
        type: r.type as never,
        capacity: r.capacity,
        building: r.building,
        floor: r.floor,
        facilities: r.type === 'LAB' ? ['PROJECTOR', 'COMPUTERS', 'AC'] : ['PROJECTOR', 'WHITEBOARD'],
      })),
    )
    .returning();
  const room = Object.fromEntries(rooms.map((r) => [r.code, r.id]));

  /* ---------- faculty ---------- */
  const facultyDefs = [
    { code: 'F001', dept: 'MGT', designation: 'Professor', first: 'Meera', last: 'Sharma', spec: ['Financial Management', 'Corporate Finance'], primary: true },
    { code: 'F002', dept: 'MGT', designation: 'Associate Professor', first: 'Rakesh', last: 'Menon', spec: ['Marketing', 'Consumer Behaviour'] },
    { code: 'F003', dept: 'MGT', designation: 'Assistant Professor', first: 'Sunita', last: 'Rao', spec: ['Organisational Behaviour', 'HR'] },
    { code: 'F004', dept: 'MGT', designation: 'Professor', first: 'Anil', last: 'Kapoor', spec: ['Business Analytics', 'Statistics'] },
    { code: 'F005', dept: 'MGT', designation: 'Assistant Professor', first: 'Deepa', last: 'Joshi', spec: ['Business Communication'] },
    { code: 'F006', dept: 'MGT', designation: 'Associate Professor', first: 'Vikram', last: 'Desai', spec: ['Operations', 'Supply Chain'] },
    { code: 'F007', dept: 'CSA', designation: 'Professor', first: 'Suresh', last: 'Kulkarni', spec: ['Data Structures', 'Algorithms'] },
    { code: 'F008', dept: 'CSA', designation: 'Associate Professor', first: 'Nandini', last: 'Bhat', spec: ['Database Systems', 'SQL'] },
    { code: 'F009', dept: 'CSA', designation: 'Assistant Professor', first: 'Pranav', last: 'Shetty', spec: ['Web Technologies', 'JavaScript'] },
    { code: 'F010', dept: 'CSA', designation: 'Assistant Professor', first: 'Kavya', last: 'Pillai', spec: ['Operating Systems', 'Networks'] },
    { code: 'F011', dept: 'CSA', designation: 'Professor', first: 'Ramesh', last: 'Iyer', spec: ['Software Engineering', 'Python'] },
    { code: 'F012', dept: 'BIO', designation: 'Professor', first: 'Lakshmi', last: 'Nair', spec: ['Molecular Biology', 'Genetics'] },
    { code: 'F013', dept: 'BIO', designation: 'Associate Professor', first: 'Arvind', last: 'Ghosh', spec: ['Biochemistry'] },
    { code: 'F014', dept: 'BIO', designation: 'Assistant Professor', first: 'Sneha', last: 'Banerjee', spec: ['Microbiology', 'Lab Techniques'] },
    { code: 'F015', dept: 'COM', designation: 'Professor', first: 'Mohan', last: 'Trivedi', spec: ['Financial Accounting', 'Auditing'] },
    { code: 'F016', dept: 'COM', designation: 'Associate Professor', first: 'Rekha', last: 'Mishra', spec: ['Taxation', 'Cost Accounting'] },
    { code: 'F017', dept: 'COM', designation: 'Assistant Professor', first: 'Sanjay', last: 'Agarwal', spec: ['Business Law'] },
    { code: 'F018', dept: 'ENG', designation: 'Professor', first: 'Girish', last: 'Chauhan', spec: ['Engineering Mathematics'] },
    { code: 'F019', dept: 'ENG', designation: 'Assistant Professor', first: 'Tanvi', last: 'Saxena', spec: ['Environmental Science'] },
    { code: 'F020', dept: 'MGT', designation: 'Assistant Professor', first: 'Harsh', last: 'Malhotra', spec: ['Entrepreneurship'] },
    { code: 'F021', dept: 'CSA', designation: 'Assistant Professor', first: 'Ishita', last: 'Bose', spec: ['Data Visualisation', 'Excel'] },
    { code: 'F022', dept: 'MGT', designation: 'Associate Professor', first: 'Naveen', last: 'Reddy', spec: ['Investment Analysis'] },
  ];

  const facultyUsers = await db
    .insert(s.users)
    .values(
      facultyDefs.map((f, i) => ({
        institutionId: inst,
        email: f.primary ? 'faculty@demo.campusos.local' : `${f.first.toLowerCase()}.${f.last.toLowerCase()}@demo.campusos.local`,
        passwordHash,
        firstName: f.first,
        lastName: f.last,
        displayName: `Dr. ${f.first} ${f.last}`,
        phone: `+91 98${String(45000000 + i * 137).slice(0, 8)}`,
        role: 'FACULTY' as const,
        status: 'ACTIVE' as const,
        departmentId: dept[f.dept]!,
        campusId: campus!.id,
      })),
    )
    .returning();

  const facultyProfiles = await db
    .insert(s.facultyProfiles)
    .values(
      facultyDefs.map((f, i) => ({
        institutionId: inst,
        userId: facultyUsers[i]!.id,
        employeeCode: f.code,
        designation: f.designation,
        departmentId: dept[f.dept]!,
        specializations: f.spec,
        qualifications: f.designation === 'Professor' ? 'Ph.D.' : 'M.Phil., NET',
        joiningDate: `20${randInt(10, 22)}-07-01`,
        maxWeeklyHours: f.designation === 'Professor' ? 14 : 18,
        // A couple of genuine availability constraints, so the solver has work to do.
        availability:
          f.code === 'F001'
            ? [
                { day: 'MONDAY', from: '10:00', to: '16:45' },
                { day: 'TUESDAY', from: '09:00', to: '16:45' },
                { day: 'THURSDAY', from: '09:00', to: '16:45' },
                { day: 'FRIDAY', from: '09:00', to: '16:45' },
                { day: 'SATURDAY', from: '09:00', to: '11:55' },
              ]
            : [],
        constraintNotes:
          f.code === 'F001' ? 'Not available before 10:00 on Monday; unavailable Wednesday.' : null,
      })),
    )
    .returning();
  const facByCode = Object.fromEntries(
    facultyDefs.map((f, i) => [f.code, facultyProfiles[i]!.id]),
  );
  console.log(`  · ${facultyProfiles.length} faculty`);

  // Heads of department.
  await db.update(s.departments).set({ headOfDepartmentId: facByCode.F001 }).where(eq(s.departments.id, dept.MGT!));
  await db.update(s.departments).set({ headOfDepartmentId: facByCode.F007 }).where(eq(s.departments.id, dept.CSA!));
  await db.update(s.departments).set({ headOfDepartmentId: facByCode.F012 }).where(eq(s.departments.id, dept.BIO!));

  /* ---------- administrators ---------- */
  const adminUsers = await db
    .insert(s.users)
    .values([
      {
        institutionId: inst,
        email: 'admin@demo.campusos.local',
        passwordHash,
        firstName: 'Rajesh',
        lastName: 'Nair',
        displayName: 'Rajesh Nair',
        role: 'ADMIN' as const,
        campusId: campus!.id,
        phone: '+91 98450 11001',
      },
      {
        institutionId: inst,
        email: 'registrar@demo.campusos.local',
        passwordHash,
        firstName: 'Vandana',
        lastName: 'Krishnan',
        displayName: 'Dr. Vandana Krishnan',
        role: 'SUPER_ADMIN' as const,
        campusId: campus!.id,
      },
      {
        institutionId: inst,
        email: 'examcell@demo.campusos.local',
        passwordHash,
        firstName: 'Prakash',
        lastName: 'Rane',
        role: 'EXAM_CELL' as const,
        campusId: campus!.id,
      },
      {
        institutionId: inst,
        email: 'itsupport@demo.campusos.local',
        passwordHash,
        firstName: 'Farhan',
        lastName: 'Qureshi',
        role: 'IT_SUPPORT' as const,
        campusId: campus!.id,
      },
      {
        institutionId: inst,
        email: 'counsellor@demo.campusos.local',
        passwordHash,
        firstName: 'Anita',
        lastName: 'Dsouza',
        role: 'COUNSELLOR' as const,
        campusId: campus!.id,
      },
    ])
    .returning();
  const admin = adminUsers[0]!;
  const registrar = adminUsers[1]!;
  const itSupport = adminUsers[3]!;
  const counsellor = adminUsers[4]!;

  /* ---------- sections ---------- */
  const sectionDefs = [
    { code: 'BBAF-3A', name: 'A', program: 'BBA-FIN', strength: 48, home: '201' },
    { code: 'BBAF-3B', name: 'B', program: 'BBA-FIN', strength: 44, home: '202' },
    { code: 'BBABA-3A', name: 'A', program: 'BBA-BA', strength: 40, home: '203' },
    { code: 'BCA-3A', name: 'A', program: 'BCA', strength: 45, home: '101' },
    { code: 'BCA-3B', name: 'B', program: 'BCA', strength: 42, home: '102' },
    { code: 'BTBIO-3A', name: 'A', program: 'BTECH-BIO', strength: 38, home: '103' },
    { code: 'BCOM-3A', name: 'A', program: 'BCOM', strength: 50, home: '301' },
    { code: 'BCOM-3B', name: 'B', program: 'BCOM', strength: 46, home: '302' },
  ];
  const sections = await db
    .insert(s.sections)
    .values(
      sectionDefs.map((sec) => ({
        institutionId: inst,
        programId: prog[sec.program]!,
        name: sec.name,
        code: sec.code,
        year: 2,
        semester: 3,
        strength: sec.strength,
        homeRoomId: room[sec.home]!,
      })),
    )
    .returning();
  const secByCode = Object.fromEntries(sections.map((x) => [x.code, x.id]));

  /* ---------- subjects ---------- */
  const subjectDefs = [
    // BBA Finance
    { code: 'FIN301', name: 'Financial Management', dept: 'MGT', hours: 4, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Evaluate capital structure', 'Compute cost of capital'] },
    { code: 'MKT301', name: 'Marketing Management', dept: 'MGT', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Segment markets', 'Design a marketing mix'] },
    { code: 'OBH301', name: 'Organisational Behaviour', dept: 'MGT', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Analyse team dynamics'] },
    { code: 'BCM301', name: 'Business Communication', dept: 'MGT', hours: 2, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Present with clarity'] },
    { code: 'INV302', name: 'Investment Analysis', dept: 'MGT', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Value equity instruments'] },
    // BBA Business Analytics
    { code: 'BAN301', name: 'Business Analytics Foundations', dept: 'MGT', hours: 4, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Frame analytical questions'] },
    { code: 'STA301', name: 'Statistics for Business', dept: 'MGT', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Apply inferential statistics'] },
    { code: 'DVZ301', name: 'Data Visualisation Lab', dept: 'CSA', hours: 4, kind: 'LAB', block: 2, roomType: 'LAB', outcomes: ['Build dashboards'] },
    // BCA
    { code: 'CSA301', name: 'Data Structures', dept: 'CSA', hours: 4, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Choose appropriate structures'] },
    { code: 'CSA302', name: 'Database Systems', dept: 'CSA', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Design normalised schemas'] },
    { code: 'CSA303', name: 'Operating Systems', dept: 'CSA', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Explain scheduling'] },
    { code: 'CSA304', name: 'Web Technologies', dept: 'CSA', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Build a client-server app'] },
    { code: 'CSA305', name: 'Programming Laboratory', dept: 'CSA', hours: 4, kind: 'LAB', block: 2, roomType: 'LAB', outcomes: ['Implement algorithms'] },
    // Biotech
    { code: 'BIO301', name: 'Molecular Biology', dept: 'BIO', hours: 4, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Describe gene expression'] },
    { code: 'BIO302', name: 'Biochemistry', dept: 'BIO', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Analyse metabolic pathways'] },
    { code: 'BIO303', name: 'Microbiology Laboratory', dept: 'BIO', hours: 4, kind: 'LAB', block: 2, roomType: 'LAB', outcomes: ['Perform aseptic technique'] },
    { code: 'ENG301', name: 'Engineering Mathematics III', dept: 'ENG', hours: 4, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Solve differential equations'] },
    // Commerce
    { code: 'COM301', name: 'Financial Accounting', dept: 'COM', hours: 4, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Prepare final accounts'] },
    { code: 'COM302', name: 'Cost Accounting', dept: 'COM', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Compute product costs'] },
    { code: 'COM303', name: 'Business Law', dept: 'COM', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Interpret contract law'] },
    { code: 'COM304', name: 'Taxation', dept: 'COM', hours: 3, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Compute taxable income'] },
    { code: 'ENV301', name: 'Environmental Studies', dept: 'ENG', hours: 2, kind: 'THEORY', block: 1, roomType: 'CLASSROOM', outcomes: ['Assess sustainability'] },
  ];

  const subjects = await db
    .insert(s.subjects)
    .values(
      subjectDefs.map((sub) => ({
        institutionId: inst,
        departmentId: dept[sub.dept]!,
        code: sub.code,
        name: sub.name,
        kind: sub.kind as never,
        credits: Math.max(2, Math.round(sub.hours * 0.75)),
        weeklyHours: sub.hours,
        consecutiveBlockSize: sub.block,
        requiredRoomType: sub.roomType as never,
        semester: 3,
        outcomes: sub.outcomes,
        description: `${sub.name} for semester 3.`,
      })),
    )
    .returning();
  const subByCode = Object.fromEntries(subjects.map((x) => [x.code, x.id]));

  /* ---------- course offerings ---------- */
  const offeringPlan: { section: string; subject: string; faculty: string }[] = [
    { section: 'BBAF-3A', subject: 'FIN301', faculty: 'F001' },
    { section: 'BBAF-3A', subject: 'MKT301', faculty: 'F002' },
    { section: 'BBAF-3A', subject: 'OBH301', faculty: 'F003' },
    { section: 'BBAF-3A', subject: 'BCM301', faculty: 'F005' },
    { section: 'BBAF-3A', subject: 'INV302', faculty: 'F022' },
    { section: 'BBAF-3B', subject: 'FIN301', faculty: 'F001' },
    { section: 'BBAF-3B', subject: 'MKT301', faculty: 'F002' },
    { section: 'BBAF-3B', subject: 'OBH301', faculty: 'F003' },
    { section: 'BBAF-3B', subject: 'BCM301', faculty: 'F005' },
    { section: 'BBAF-3B', subject: 'INV302', faculty: 'F022' },
    { section: 'BBABA-3A', subject: 'BAN301', faculty: 'F004' },
    { section: 'BBABA-3A', subject: 'STA301', faculty: 'F004' },
    { section: 'BBABA-3A', subject: 'DVZ301', faculty: 'F021' },
    { section: 'BBABA-3A', subject: 'MKT301', faculty: 'F002' },
    { section: 'BBABA-3A', subject: 'BCM301', faculty: 'F005' },
    { section: 'BCA-3A', subject: 'CSA301', faculty: 'F007' },
    { section: 'BCA-3A', subject: 'CSA302', faculty: 'F008' },
    { section: 'BCA-3A', subject: 'CSA303', faculty: 'F010' },
    { section: 'BCA-3A', subject: 'CSA304', faculty: 'F009' },
    { section: 'BCA-3A', subject: 'CSA305', faculty: 'F011' },
    { section: 'BCA-3B', subject: 'CSA301', faculty: 'F007' },
    { section: 'BCA-3B', subject: 'CSA302', faculty: 'F008' },
    { section: 'BCA-3B', subject: 'CSA303', faculty: 'F010' },
    { section: 'BCA-3B', subject: 'CSA304', faculty: 'F009' },
    { section: 'BCA-3B', subject: 'CSA305', faculty: 'F011' },
    { section: 'BTBIO-3A', subject: 'BIO301', faculty: 'F012' },
    { section: 'BTBIO-3A', subject: 'BIO302', faculty: 'F013' },
    { section: 'BTBIO-3A', subject: 'BIO303', faculty: 'F014' },
    { section: 'BTBIO-3A', subject: 'ENG301', faculty: 'F018' },
    { section: 'BTBIO-3A', subject: 'ENV301', faculty: 'F019' },
    { section: 'BCOM-3A', subject: 'COM301', faculty: 'F015' },
    { section: 'BCOM-3A', subject: 'COM302', faculty: 'F016' },
    { section: 'BCOM-3A', subject: 'COM303', faculty: 'F017' },
    { section: 'BCOM-3A', subject: 'COM304', faculty: 'F016' },
    { section: 'BCOM-3A', subject: 'ENV301', faculty: 'F019' },
    { section: 'BCOM-3B', subject: 'COM301', faculty: 'F015' },
    { section: 'BCOM-3B', subject: 'COM302', faculty: 'F016' },
    { section: 'BCOM-3B', subject: 'COM303', faculty: 'F017' },
    { section: 'BCOM-3B', subject: 'COM304', faculty: 'F016' },
    { section: 'BCOM-3B', subject: 'ENV301', faculty: 'F019' },
  ];

  const offerings = await db
    .insert(s.courseOfferings)
    .values(
      offeringPlan.map((o) => ({
        institutionId: inst,
        termId: term!.id,
        subjectId: subByCode[o.subject]!,
        sectionId: secByCode[o.section]!,
        facultyId: facByCode[o.faculty]!,
        minAttendancePercentage: '75',
      })),
    )
    .returning();
  console.log(`  · ${offerings.length} course offerings`);

  /* ---------- students ---------- */
  const studentUserRows: (typeof s.users.$inferInsert)[] = [];
  const studentMeta: { section: string; roll: string; index: number }[] = [];
  let rollCounter = 1;

  for (const sec of sectionDefs) {
    for (let i = 0; i < sec.strength; i += 1) {
      const n = personName();
      const isPrimaryDemo = sec.code === 'BBAF-3A' && i === 0;
      const roll = `${sec.code.split('-')[0]}26${String(rollCounter).padStart(3, '0')}`;
      rollCounter += 1;

      studentUserRows.push({
        institutionId: inst,
        email: isPrimaryDemo
          ? 'student@demo.campusos.local'
          : `${roll.toLowerCase()}@demo.campusos.local`,
        passwordHash,
        firstName: isPrimaryDemo ? 'Ananya' : n.first,
        lastName: isPrimaryDemo ? 'Iyer' : n.last,
        role: 'STUDENT',
        status: 'ACTIVE',
        campusId: campus!.id,
        departmentId: dept[programDefs.find((p) => p.code === sec.program)!.dept]!,
      });
      studentMeta.push({ section: sec.code, roll, index: studentUserRows.length - 1 });
    }
  }

  const studentUsers: (typeof s.users.$inferSelect)[] = [];
  for (let i = 0; i < studentUserRows.length; i += 200) {
    const batch = await db.insert(s.users).values(studentUserRows.slice(i, i + 200)).returning();
    studentUsers.push(...batch);
  }

  const studentProfileRows = studentMeta.map((m, i) => {
    const sec = sectionDefs.find((x) => x.code === m.section)!;
    return {
      institutionId: inst,
      userId: studentUsers[i]!.id,
      rollNumber: m.roll,
      admissionNumber: `ADM${m.roll}`,
      programId: prog[sec.program]!,
      sectionId: secByCode[sec.code]!,
      currentYear: 2,
      currentSemester: 3,
      admissionDate: '2025-07-15',
      expectedGraduation: '2028-05-31',
      dateOfBirth: `200${randInt(4, 6)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
      guardianName: `${pick(LAST)} (Guardian)`,
      guardianPhone: `+91 98${String(30000000 + i * 91).slice(0, 8)}`,
      cgpa: (6.2 + rand() * 3.4).toFixed(2),
    };
  });

  const studentProfiles: (typeof s.studentProfiles.$inferSelect)[] = [];
  for (let i = 0; i < studentProfileRows.length; i += 200) {
    const batch = await db
      .insert(s.studentProfiles)
      .values(studentProfileRows.slice(i, i + 200))
      .returning();
    studentProfiles.push(...batch);
  }
  console.log(`  · ${studentProfiles.length} students`);

  const studentsBySection = new Map<string, typeof studentProfiles>();
  studentProfiles.forEach((sp, i) => {
    const code = studentMeta[i]!.section;
    const list = studentsBySection.get(code) ?? [];
    list.push(sp);
    studentsBySection.set(code, list);
  });

  // Class representatives.
  for (const sec of sections) {
    const list = studentsBySection.get(sec.code) ?? [];
    if (list[0]) {
      await db
        .update(s.sections)
        .set({ classRepresentativeId: list[0].userId })
        .where(eq(s.sections.id, sec.id));
    }
  }

  /* ---------- enrollments ---------- */
  const enrollmentRows: (typeof s.enrollments.$inferInsert)[] = [];
  for (let i = 0; i < offerings.length; i += 1) {
    const plan = offeringPlan[i]!;
    const list = studentsBySection.get(plan.section) ?? [];
    for (const sp of list) {
      enrollmentRows.push({
        institutionId: inst,
        offeringId: offerings[i]!.id,
        studentId: sp.id,
      });
    }
  }
  for (let i = 0; i < enrollmentRows.length; i += 500) {
    await db.insert(s.enrollments).values(enrollmentRows.slice(i, i + 500));
  }
  console.log(`  · ${enrollmentRows.length} enrollments`);

  /* ---------- timetable via the real solver ---------- */
  console.log('  · running the constraint solver…');
  const assignableSlots = timeSlots.filter((t) => t.kind === 'TEACHING');

  const solverSessions: SolverSession[] = [];
  for (let i = 0; i < offerings.length; i += 1) {
    const plan = offeringPlan[i]!;
    const subjectDef = subjectDefs.find((x) => x.code === plan.subject)!;
    const count = Math.max(1, Math.floor(subjectDef.hours / subjectDef.block));
    for (let k = 0; k < count; k += 1) {
      solverSessions.push({
        id: `${offerings[i]!.id}::${k}`,
        offeringId: offerings[i]!.id,
        subjectId: subByCode[plan.subject]!,
        subjectCode: plan.subject,
        subjectName: subjectDef.name,
        sectionId: secByCode[plan.section]!,
        facultyId: facByCode[plan.faculty]!,
        length: subjectDef.block,
        requiredRoomType: subjectDef.roomType,
        spreadKey: offerings[i]!.id,
      });
    }
  }

  // Dr. Sharma's real availability constraint, expressed for the solver.
  const sharmaBlocked = assignableSlots
    .filter(
      (t) =>
        t.dayOfWeek === 'WEDNESDAY' ||
        (t.dayOfWeek === 'MONDAY' && t.position === 1),
    )
    .map((t) => t.id);

  const solverInput: SolverInput = {
    slots: timeSlots.map((t) => ({
      id: t.id,
      day: t.dayOfWeek,
      position: t.position,
      startTime: t.startTime,
      endTime: t.endTime,
      assignable: t.kind === 'TEACHING',
    })),
    rooms: rooms
      .filter((r) => r.type === 'CLASSROOM' || r.type === 'LAB')
      .map((r) => ({ id: r.id, code: r.code, type: r.type, capacity: r.capacity })),
    faculty: facultyDefs.map((f) => ({
      id: facByCode[f.code]!,
      name: `${f.first} ${f.last}`,
      unavailableSlotIds: f.code === 'F001' ? sharmaBlocked : [],
      maxWeeklyHours: f.designation === 'Professor' ? 14 : 18,
      maxDailyHours: 4,
    })),
    sections: sectionDefs.map((sec) => ({
      id: secByCode[sec.code]!,
      code: sec.code,
      strength: sec.strength,
      homeRoomId: room[sec.home]!,
      maxDailyHours: 6,
    })),
    sessions: solverSessions,
    constraints: [
      {
        kind: 'FACULTY_UNAVAILABLE',
        severity: 'HARD',
        facultyId: facByCode.F001,
        slotIds: sharmaBlocked,
        description: 'Dr. Meera Sharma is unavailable on Wednesdays and before 10:00 on Monday.',
      },
    ],
    options: { seed: 20260820, timeLimitMs: 25_000, refinementIterations: 12000 },
  };

  const solved = await defaultSolver.solve(solverInput);
  console.log(
    `    solver: ${solved.report.placedCount} placed, ${solved.report.unplacedCount} unplaced, quality ${solved.report.qualityScore}/100, ${solved.report.durationMs}ms`,
  );

  const [ttVersion] = await db
    .insert(s.timetableVersions)
    .values({
      institutionId: inst,
      termId: term!.id,
      name: 'Odd Semester 2026-27 — published',
      status: 'PUBLISHED',
      versionNumber: 1,
      generatedBy: defaultSolver.name,
      createdById: admin.id,
      publishedById: admin.id,
      publishedAt: new Date(),
      solverReport: solved.report as unknown as Record<string, unknown>,
    })
    .returning();

  const slotById = new Map(timeSlots.map((t) => [t.id, t]));
  const entryRows = solved.placements.flatMap((p) =>
    p.slotIds.map((slotId) => ({
      institutionId: inst,
      versionId: ttVersion!.id,
      offeringId: p.offeringId,
      timeSlotId: slotId,
      roomId: p.roomId,
      facultyId: p.facultyId,
      sectionId: p.sectionId,
      dayOfWeek: slotById.get(slotId)!.dayOfWeek,
    })),
  );
  for (let i = 0; i < entryRows.length; i += 500) {
    await db.insert(s.timetableEntries).values(entryRows.slice(i, i + 500));
  }
  console.log(`  · ${entryRows.length} timetable periods published`);

  const entries = await db
    .select()
    .from(s.timetableEntries)
    .where(eq(s.timetableEntries.versionId, ttVersion!.id));

  /* ---------- attendance: last 5 teaching weeks ---------- */
  console.log('  · generating attendance…');
  const today = new Date('2026-08-20T00:00:00.000Z');
  const dayIndex: Record<string, number> = {
    SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
  };

  const enrollmentsByOffering = new Map<string, string[]>();
  for (const e of enrollmentRows) {
    const list = enrollmentsByOffering.get(e.offeringId as string) ?? [];
    list.push(e.studentId as string);
    enrollmentsByOffering.set(e.offeringId as string, list);
  }

  // Give each student a stable "reliability" so attendance patterns look human.
  const reliability = new Map<string, number>();
  for (const sp of studentProfiles) {
    reliability.set(sp.id, 0.62 + rand() * 0.36);
  }

  const sessionRows: (typeof s.attendanceSessions.$inferInsert)[] = [];
  const sessionKeys: { offeringId: string; date: string; entryId: string; facultyId: string | null }[] = [];

  for (let week = 5; week >= 1; week -= 1) {
    for (const entry of entries) {
      const slot = slotById.get(entry.timeSlotId)!;
      const targetDow = dayIndex[slot.dayOfWeek]!;
      const base = addDays(today, -(week * 7));
      const diff = (targetDow - base.getUTCDay() + 7) % 7;
      const date = addDays(base, diff);
      if (date >= today) continue;
      const ds = dateOnly(date);
      if (['2026-08-15', '2026-07-17'].includes(ds)) continue;

      sessionRows.push({
        institutionId: inst,
        offeringId: entry.offeringId,
        timetableEntryId: entry.id,
        date: ds,
        roomId: entry.roomId,
        takenById: entry.facultyId,
        status: 'LOCKED',
        topicCovered: null,
        submittedAt: date,
        lockedAt: date,
      });
      sessionKeys.push({
        offeringId: entry.offeringId,
        date: ds,
        entryId: entry.id,
        facultyId: entry.facultyId,
      });
    }
  }

  // De-duplicate: multi-period blocks share one attendance session per day.
  const seenSession = new Set<string>();
  const uniqueSessions: typeof sessionRows = [];
  const uniqueKeys: typeof sessionKeys = [];
  sessionRows.forEach((row, i) => {
    const key = `${row.offeringId}|${row.date}`;
    if (seenSession.has(key)) return;
    seenSession.add(key);
    uniqueSessions.push(row);
    uniqueKeys.push(sessionKeys[i]!);
  });

  const insertedSessions: (typeof s.attendanceSessions.$inferSelect)[] = [];
  for (let i = 0; i < uniqueSessions.length; i += 400) {
    const batch = await db
      .insert(s.attendanceSessions)
      .values(uniqueSessions.slice(i, i + 400))
      .returning();
    insertedSessions.push(...batch);
  }

  const recordRows: (typeof s.attendanceRecords.$inferInsert)[] = [];
  const attendanceTally = new Map<string, { held: number; attended: number }>();

  for (const session of insertedSessions) {
    const students = enrollmentsByOffering.get(session.offeringId) ?? [];
    let present = 0;
    for (const studentId of students) {
      const r = reliability.get(studentId) ?? 0.8;
      const isPresent = rand() < r;
      if (isPresent) present += 1;
      recordRows.push({
        institutionId: inst,
        sessionId: session.id,
        studentId,
        status: isPresent ? 'PRESENT' : chance(0.12) ? 'MEDICAL' : 'ABSENT',
        markedById: null,
        markedAt: new Date(`${session.date}T10:00:00.000Z`),
      });
      const key = `${studentId}|${session.offeringId}`;
      const tally = attendanceTally.get(key) ?? { held: 0, attended: 0 };
      tally.held += 1;
      if (isPresent) tally.attended += 1;
      attendanceTally.set(key, tally);
    }
    session.presentCount = present;
    session.absentCount = students.length - present;
    session.totalCount = students.length;
  }

  for (let i = 0; i < recordRows.length; i += 1000) {
    await db.insert(s.attendanceRecords).values(recordRows.slice(i, i + 1000));
  }

  // Update denormalised session counts in one statement per batch.
  for (const session of insertedSessions) {
    await db
      .update(s.attendanceSessions)
      .set({
        presentCount: session.presentCount,
        absentCount: session.absentCount,
        totalCount: session.totalCount,
      })
      .where(eq(s.attendanceSessions.id, session.id));
  }

  const summaryRows: (typeof s.attendanceSummaries.$inferInsert)[] = [];
  for (const [key, tally] of attendanceTally) {
    const [studentId, offeringId] = key.split('|') as [string, string];
    const bp = tally.held === 0 ? 0 : Math.round((tally.attended / tally.held) * 10000);
    // How many more absences before dropping under 75%.
    const headroom = Math.max(0, Math.floor(tally.attended / 0.75) - tally.held);
    summaryRows.push({
      institutionId: inst,
      studentId,
      offeringId,
      heldSessions: tally.held,
      attendedSessions: tally.attended,
      percentageBp: bp,
      isBelowThreshold: bp < 7500,
      absenceHeadroom: headroom,
    });
  }
  for (let i = 0; i < summaryRows.length; i += 500) {
    await db.insert(s.attendanceSummaries).values(summaryRows.slice(i, i + 500));
  }

  // Roll overall attendance onto the student profile.
  const overall = new Map<string, { held: number; attended: number }>();
  for (const [key, tally] of attendanceTally) {
    const studentId = key.split('|')[0]!;
    const agg = overall.get(studentId) ?? { held: 0, attended: 0 };
    agg.held += tally.held;
    agg.attended += tally.attended;
    overall.set(studentId, agg);
  }
  for (const [studentId, agg] of overall) {
    await db
      .update(s.studentProfiles)
      .set({
        attendancePercentage: agg.held ? ((agg.attended / agg.held) * 100).toFixed(2) : '0',
      })
      .where(eq(s.studentProfiles.id, studentId));
  }
  console.log(`  · ${recordRows.length} attendance records across ${insertedSessions.length} sessions`);

  await seedAcademicWork();
  await seedCommunication();
  await seedGrievances();
  await seedSkills();
  await seedWorkload();

  // A student who runs the E-Cell: CLUB_ADMIN as a secondary role.
  const clubLead = studentProfiles[1]!.userId;
  await db.update(s.users).set({ secondaryRoles: ['CLUB_ADMIN'] }).where(eq(s.users.id, clubLead));
  await seedEventsNetwork(db, {
    mainInstitutionId: inst,
    passwordHash,
    demoStudentUserId: studentProfiles[0]!.userId,
    otherStudentUserIds: studentProfiles.slice(2, 60).map((p) => p.userId),
    eventOrganizerUserId: clubLead,
  });

  // CampusOS 2.0 foundation: institution-issued accounts are verified, the
  // demo college accepts self-registration with admin approval, and the
  // default data-retention policies exist.
  await db.execute(sql`UPDATE users SET email_verified_at = created_at WHERE institution_id = ${inst} AND status = 'ACTIVE'`);
  await db.execute(sql`UPDATE notifications SET delivery_planned_at = created_at WHERE institution_id = ${inst}`);
  await ensureRetentionPolicies(inst);
  console.log('  · privacy defaults and registration policy');

  console.log(`\nSeed complete in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log('\nDemo accounts (password from DEMO_PASSWORD):');
  console.log('  student@demo.campusos.local  — Ananya Iyer, BBA Finance 3A');
  console.log('  faculty@demo.campusos.local  — Dr. Meera Sharma, Management');
  console.log('  admin@demo.campusos.local    — Rajesh Nair, Academic Office');
  console.log('  registrar@demo.campusos.local— Dr. Vandana Krishnan (super admin)');

  /* ======================= sub-seeders ======================= */

  async function seedAcademicWork() {
    console.log('  · assignments, submissions, resources…');

    const assignmentRows: (typeof s.assignments.$inferInsert)[] = [];
    const assignmentPlans: { offeringIndex: number; title: string; days: number; status: 'PUBLISHED' | 'DRAFT' }[] = [
      { offeringIndex: 0, title: 'Cost of Capital — case analysis', days: 4, status: 'PUBLISHED' },
      { offeringIndex: 0, title: 'Capital budgeting problem set', days: -3, status: 'PUBLISHED' },
      { offeringIndex: 1, title: 'Segmentation study of a local brand', days: 7, status: 'PUBLISHED' },
      { offeringIndex: 2, title: 'Team dynamics reflection', days: 2, status: 'PUBLISHED' },
      { offeringIndex: 5, title: 'Cost of Capital — case analysis', days: 4, status: 'PUBLISHED' },
      { offeringIndex: 10, title: 'Analytics problem framing', days: 5, status: 'PUBLISHED' },
      { offeringIndex: 15, title: 'Linked list implementation', days: -2, status: 'PUBLISHED' },
      { offeringIndex: 16, title: 'Normalisation exercise', days: 6, status: 'PUBLISHED' },
      { offeringIndex: 19, title: 'Sorting algorithms lab record', days: 3, status: 'PUBLISHED' },
      { offeringIndex: 25, title: 'Gene expression essay', days: 8, status: 'PUBLISHED' },
      { offeringIndex: 30, title: 'Final accounts preparation', days: -1, status: 'PUBLISHED' },
      { offeringIndex: 31, title: 'Process costing worksheet', days: 9, status: 'DRAFT' },
    ];

    for (const plan of assignmentPlans) {
      const offering = offerings[plan.offeringIndex];
      if (!offering) continue;
      const facultyId = offering.facultyId;
      assignmentRows.push({
        institutionId: inst,
        offeringId: offering.id,
        createdById: facultyId,
        title: plan.title,
        instructions: `${plan.title}. Submit as a single PDF. Late submissions attract a 10% penalty per day.`,
        maxScore: '20',
        weightPercentage: '10',
        rubric: [
          { criterion: 'Correctness of analysis', maxScore: 10, descriptor: 'Method and computation' },
          { criterion: 'Use of evidence', maxScore: 5, descriptor: 'Data and citations' },
          { criterion: 'Clarity of writing', maxScore: 5, descriptor: 'Structure and expression' },
        ],
        skillTags: ['Financial Analysis', 'Written Communication'],
        dueAt: addDays(today, plan.days),
        status: plan.status,
        publishedAt: plan.status === 'PUBLISHED' ? addDays(today, -10) : null,
      });
    }

    const assignments = await db.insert(s.assignments).values(assignmentRows).returning();

    const submissionRows: (typeof s.submissions.$inferInsert)[] = [];
    for (const assignment of assignments) {
      if (assignment.status !== 'PUBLISHED') continue;
      const students = enrollmentsByOffering.get(assignment.offeringId) ?? [];
      const overdue = assignment.dueAt ? assignment.dueAt < today : false;

      for (const studentId of students) {
        const submitted = overdue ? chance(0.88) : chance(0.35);
        if (!submitted) {
          submissionRows.push({
            institutionId: inst,
            assignmentId: assignment.id,
            studentId,
            status: 'NOT_SUBMITTED',
          });
          continue;
        }
        const late = overdue && chance(0.14);
        const evaluated = overdue && chance(0.55);
        submissionRows.push({
          institutionId: inst,
          assignmentId: assignment.id,
          studentId,
          status: evaluated ? 'EVALUATED' : late ? 'LATE' : 'SUBMITTED',
          submittedAt: addDays(assignment.dueAt ?? today, late ? 1 : -1),
          content: 'Submitted via CampusOS.',
          score: evaluated ? (10 + rand() * 10).toFixed(1) : null,
          feedback: evaluated ? 'Good structure. Strengthen the justification of assumptions.' : null,
          evaluatedAt: evaluated ? addDays(today, -1) : null,
        });
      }
    }
    for (let i = 0; i < submissionRows.length; i += 500) {
      await db.insert(s.submissions).values(submissionRows.slice(i, i + 500));
    }

    /* resources */
    await db.insert(s.resources).values([
      {
        institutionId: inst,
        title: 'Weighted Average Cost of Capital — worked examples',
        description: 'Six worked WACC problems with step-by-step solutions for second-year BBA.',
        kind: 'NOTES',
        status: 'PUBLISHED',
        ownerId: facultyUsers[0]!.id,
        departmentId: dept.MGT!,
        subjectId: subByCode.FIN301!,
        topic: 'Cost of Capital',
        semester: 3,
        difficulty: 'INTERMEDIATE',
        academicYear: '2026-27',
        visibility: 'INSTITUTION',
        extractedText:
          'WACC weighted average cost of capital equity debt cost of equity CAPM beta risk free rate market risk premium capital structure gearing',
        viewCount: 142,
      },
      {
        institutionId: inst,
        title: 'Capital Structure — lecture slides',
        description: 'Slides covering Modigliani-Miller propositions and trade-off theory.',
        kind: 'SLIDES',
        status: 'PUBLISHED',
        ownerId: facultyUsers[0]!.id,
        departmentId: dept.MGT!,
        subjectId: subByCode.FIN301!,
        topic: 'Capital Structure',
        semester: 3,
        difficulty: 'INTERMEDIATE',
        visibility: 'DEPARTMENT',
        extractedText: 'capital structure modigliani miller trade off theory pecking order leverage',
        viewCount: 88,
      },
      {
        institutionId: inst,
        title: 'Normalisation to BCNF — practice set',
        description: 'Functional dependency and normalisation exercises with answers.',
        kind: 'QUESTION_BANK',
        status: 'PUBLISHED',
        ownerId: facultyUsers[7]!.id,
        departmentId: dept.CSA!,
        subjectId: subByCode.CSA302!,
        topic: 'Normalisation',
        semester: 3,
        difficulty: 'ADVANCED',
        visibility: 'INSTITUTION',
        extractedText: 'normalisation 1NF 2NF 3NF BCNF functional dependency candidate key decomposition lossless',
        viewCount: 203,
      },
      {
        institutionId: inst,
        title: 'Aseptic technique — laboratory protocol',
        description: 'Standard operating procedure for the microbiology laboratory.',
        kind: 'DOCUMENT',
        status: 'PUBLISHED',
        ownerId: facultyUsers[13]!.id,
        departmentId: dept.BIO!,
        subjectId: subByCode.BIO303!,
        topic: 'Aseptic Technique',
        semester: 3,
        visibility: 'DEPARTMENT',
        extractedText: 'aseptic technique sterilisation autoclave laminar flow inoculation contamination microbiology',
        viewCount: 61,
      },
      {
        institutionId: inst,
        title: 'Depreciation methods — summary sheet',
        description: 'Straight line, written down value and units of production compared.',
        kind: 'NOTES',
        status: 'AI_GENERATED_PENDING_REVIEW',
        isAiGenerated: true,
        ownerId: facultyUsers[14]!.id,
        departmentId: dept.COM!,
        subjectId: subByCode.COM301!,
        topic: 'Depreciation',
        semester: 3,
        visibility: 'DEPARTMENT',
        extractedText: 'depreciation straight line written down value units of production salvage value useful life',
      },
    ]);

    /* an approved lesson plan from the copilot */
    await db.insert(s.lessonPlans).values({
      institutionId: inst,
      offeringId: offerings[0]!.id,
      subjectId: subByCode.FIN301!,
      authorId: facultyUsers[0]!.id,
      title: 'Cost of Capital — introduction',
      topic: 'Cost of Capital',
      durationMinutes: 55,
      status: 'PUBLISHED',
      isAiGenerated: true,
      estimatedManualMinutes: 45,
      actualMinutesSpent: 6,
      publishedAt: addDays(today, -6),
      content: {
        objectives: [
          'Explain why a firm has a cost of capital',
          'Compute the cost of equity using CAPM',
          'Compute WACC for a two-source capital structure',
        ],
        structure: [
          { minutes: 5, activity: 'Recap: sources of long-term finance' },
          { minutes: 15, activity: 'Cost of equity — CAPM derivation and intuition' },
          { minutes: 15, activity: 'Cost of debt, tax shield, after-tax cost' },
          { minutes: 12, activity: 'Worked WACC example on the board' },
          { minutes: 8, activity: 'Pair exercise and wrap-up' },
        ],
        misconceptions: [
          'Students often treat the coupon rate as the cost of debt rather than the yield.',
          'Book-value weights are frequently used where market-value weights are required.',
        ],
        quiz: [
          { q: 'A firm has 60% equity at 14% and 40% debt at 9% pre-tax, tax 30%. Find WACC.', a: '10.92%' },
          { q: 'Why is the after-tax cost of debt lower than the pre-tax cost?', a: 'Interest is tax deductible.' },
        ],
        homework: 'Problems 4.1 to 4.6 from the prescribed text.',
      },
    });

    await db.insert(s.timeSavedEvents).values([
      {
        institutionId: inst,
        userId: facultyUsers[0]!.id,
        activity: 'LESSON_PLAN',
        estimatedManualMinutes: 45,
        actualMinutes: 6,
        savedMinutes: 39,
        basis: 'DEFAULT_ESTIMATE',
        entityType: 'lesson_plan',
      },
      {
        institutionId: inst,
        userId: admin.id,
        activity: 'TIMETABLE_SOLVE',
        estimatedManualMinutes: 960,
        actualMinutes: 3,
        savedMinutes: 957,
        basis: 'DEFAULT_ESTIMATE',
        entityType: 'timetable_version',
      },
      {
        institutionId: inst,
        userId: admin.id,
        activity: 'BULK_ANNOUNCE',
        estimatedManualMinutes: 40,
        actualMinutes: 4,
        savedMinutes: 36,
        basis: 'DEFAULT_ESTIMATE',
        entityType: 'announcement',
      },
    ]);
  }

  async function seedCommunication() {
    console.log('  · announcements, notifications, change feed…');

    const allStudentUserIds = studentProfiles.map((sp) => sp.userId);
    const allFacultyUserIds = facultyUsers.map((u) => u.id);

    const announcementDefs = [
      {
        ref: 'NOTICE-2026-00181',
        title: 'Semester examination schedule released',
        body: 'The examination schedule for Odd Semester 2026-27 has been published. Please review your subject dates and report any clash to the examination cell within three working days.',
        category: 'EXAMINATION' as const,
        priority: 'IMPORTANT' as const,
        kind: 'OFFICIAL' as const,
        requiresAck: true,
        audience: 'ALL_STUDENTS',
        daysAgo: 3,
      },
      {
        ref: 'NOTICE-2026-00182',
        title: 'Classes begin at 11:00 AM tomorrow — water supply maintenance',
        body: 'Due to scheduled water supply maintenance in Academic Block A, all classes on 21 August will begin at 11:00 AM. Periods 1 and 2 stand cancelled and will be compensated on Saturday.',
        category: 'ACADEMIC' as const,
        priority: 'CRITICAL' as const,
        kind: 'OFFICIAL' as const,
        requiresAck: true,
        audience: 'ALL',
        daysAgo: 1,
      },
      {
        ref: 'NOTICE-2026-00183',
        title: 'Guest lecture: Careers in Investment Research',
        body: 'A guest lecture by a practising equity research analyst will be held in Seminar Hall 1 on Friday at 2:00 PM. Open to all BBA Finance and Business Analytics students.',
        category: 'EVENT' as const,
        priority: 'NORMAL' as const,
        kind: 'INFORMATIONAL' as const,
        requiresAck: false,
        audience: 'BBA',
        daysAgo: 2,
      },
      {
        ref: 'NOTICE-2026-00184',
        title: 'Attendance shortage — first warning',
        body: 'Students below 75% attendance in any subject have been individually notified. Please meet your faculty advisor this week to discuss a recovery plan.',
        category: 'ACADEMIC' as const,
        priority: 'IMPORTANT' as const,
        kind: 'OFFICIAL' as const,
        requiresAck: true,
        audience: 'ALL_STUDENTS',
        daysAgo: 5,
      },
      {
        ref: 'NOTICE-2026-00185',
        title: 'Faculty meeting — semester review',
        body: 'All teaching faculty are requested to attend the semester review meeting on Thursday at 4:00 PM in the Board Room. Please bring your course completion status.',
        category: 'ADMINISTRATIVE' as const,
        priority: 'IMPORTANT' as const,
        kind: 'OFFICIAL' as const,
        requiresAck: true,
        audience: 'FACULTY',
        daysAgo: 2,
      },
      {
        ref: 'NOTICE-2026-00186',
        title: 'Library extended hours during examinations',
        body: 'The central library will remain open until 10:00 PM from 1 October through the examination period.',
        category: 'FACILITY' as const,
        priority: 'INFORMATIONAL' as const,
        kind: 'INFORMATIONAL' as const,
        requiresAck: false,
        audience: 'ALL',
        daysAgo: 8,
      },
    ];

    for (const def of announcementDefs) {
      const [ann] = await db
        .insert(s.announcements)
        .values({
          institutionId: inst,
          reference: def.ref,
          title: def.title,
          body: def.body,
          summary: def.body.slice(0, 140),
          authorId: def.audience === 'FACULTY' ? registrar.id : admin.id,
          kind: def.kind,
          category: def.category,
          priority: def.priority,
          status: 'PUBLISHED',
          requiresAcknowledgement: def.requiresAck,
          acknowledgementDeadline: def.requiresAck ? addDays(today, 2) : null,
          publishedAt: addDays(today, -def.daysAgo),
          publishAt: addDays(today, -def.daysAgo),
          expiresAt: addDays(today, 30),
          allowComments: def.category === 'EVENT',
          isEmergencyBroadcast: def.priority === 'CRITICAL',
        })
        .returning();

      let recipientIds: string[] = [];
      if (def.audience === 'ALL') {
        recipientIds = [...allStudentUserIds, ...allFacultyUserIds];
        await db.insert(s.announcementTargets).values({
          institutionId: inst,
          announcementId: ann!.id,
          scope: 'INSTITUTION',
        });
      } else if (def.audience === 'ALL_STUDENTS') {
        recipientIds = allStudentUserIds;
        await db.insert(s.announcementTargets).values({
          institutionId: inst,
          announcementId: ann!.id,
          scope: 'ROLE',
          role: 'STUDENT',
        });
      } else if (def.audience === 'FACULTY') {
        recipientIds = allFacultyUserIds;
        await db.insert(s.announcementTargets).values({
          institutionId: inst,
          announcementId: ann!.id,
          scope: 'ROLE',
          role: 'FACULTY',
        });
      } else if (def.audience === 'BBA') {
        const bbaSections = ['BBAF-3A', 'BBAF-3B', 'BBABA-3A'];
        recipientIds = studentProfiles
          .filter((sp, i) => bbaSections.includes(studentMeta[i]!.section))
          .map((sp) => sp.userId);
        await db.insert(s.announcementTargets).values(
          bbaSections.map((code) => ({
            institutionId: inst,
            announcementId: ann!.id,
            scope: 'SECTION' as const,
            sectionId: secByCode[code]!,
          })),
        );
      }

      const recipientRows = recipientIds.map((userId) => {
        const read = chance(0.82);
        const acked = def.requiresAck && read && chance(0.87);
        return {
          institutionId: inst,
          announcementId: ann!.id,
          userId,
          readAt: read ? addDays(today, -def.daysAgo + 1) : null,
          acknowledgedAt: acked ? addDays(today, -def.daysAgo + 1) : null,
          matchedScope: 'INSTITUTION' as const,
        };
      });

      for (let i = 0; i < recipientRows.length; i += 500) {
        await db.insert(s.announcementRecipients).values(recipientRows.slice(i, i + 500));
      }

      await db
        .update(s.announcements)
        .set({
          recipientCount: recipientRows.length,
          readCount: recipientRows.filter((r) => r.readAt).length,
          acknowledgedCount: recipientRows.filter((r) => r.acknowledgedAt).length,
        })
        .where(eq(s.announcements.id, ann!.id));
    }

    /* change feed */
    await db.insert(s.changeEvents).values([
      {
        institutionId: inst,
        kind: 'ROOM_CHANGED',
        title: 'Financial Management moved to Room 302',
        summary: 'Room 204 → Room 302',
        beforeValue: { room: '204', time: '13:50' },
        afterValue: { room: '302', time: '13:50' },
        reason: 'Projector failure in Room 204',
        entityType: 'timetable_entry',
        changedById: admin.id,
        approvedById: admin.id,
        affectedSectionIds: [secByCode['BBAF-3A']!],
        affectedCount: 48,
        effectiveFrom: addDays(today, -1),
      },
      {
        institutionId: inst,
        kind: 'CLASS_CANCELLED',
        title: 'Business Communication cancelled on Friday',
        summary: 'Class cancelled — faculty on approved leave',
        beforeValue: { status: 'SCHEDULED' },
        afterValue: { status: 'CANCELLED' },
        reason: 'Faculty attending an accreditation workshop',
        entityType: 'schedule_exception',
        changedById: admin.id,
        affectedSectionIds: [secByCode['BBAF-3A']!, secByCode['BBAF-3B']!],
        affectedCount: 92,
        effectiveFrom: addDays(today, 2),
      },
      {
        institutionId: inst,
        kind: 'DEADLINE_CHANGED',
        title: 'Assignment deadline extended',
        summary: '22 Aug → 25 Aug',
        beforeValue: { dueAt: '2026-08-22' },
        afterValue: { dueAt: '2026-08-25' },
        reason: 'Overlap with the guest lecture week',
        entityType: 'assignment',
        changedById: facultyUsers[1]!.id,
        affectedSectionIds: [secByCode['BBAF-3A']!],
        affectedCount: 48,
        effectiveFrom: addDays(today, -2),
      },
      {
        institutionId: inst,
        kind: 'HOLIDAY_DECLARED',
        title: 'Founders Day — half day declared',
        summary: 'Afternoon classes suspended on 5 September',
        afterValue: { date: '2026-09-05', halfDay: true },
        reason: 'Institutional Founders Day celebration',
        entityType: 'holiday',
        changedById: registrar.id,
        affectedCount: studentProfiles.length,
        effectiveFrom: new Date('2026-09-05'),
      },
    ]);

    /* events */
    await db.insert(s.events).values([
      {
        institutionId: inst,
        title: 'Careers in Investment Research',
        description: 'A practising equity research analyst discusses career paths and required skills.',
        organizerId: facultyUsers[21]!.id,
        departmentId: dept.MGT!,
        roomId: room['SEM-1']!,
        startsAt: new Date(addDays(today, 3).setUTCHours(14, 0, 0, 0)),
        endsAt: new Date(addDays(today, 3).setUTCHours(16, 0, 0, 0)),
        capacity: 120,
        registrationRequired: true,
        speaker: 'Ms. Kavita Rangan, CFA',
        status: 'SCHEDULED',
      },
      {
        institutionId: inst,
        title: 'Annual Technical Symposium',
        description: 'Student project exhibition and paper presentations.',
        organizerId: facultyUsers[6]!.id,
        departmentId: dept.CSA!,
        roomId: room.AUD!,
        startsAt: new Date(addDays(today, 21).setUTCHours(9, 0, 0, 0)),
        endsAt: new Date(addDays(today, 22).setUTCHours(17, 0, 0, 0)),
        capacity: 400,
        registrationRequired: true,
        status: 'SCHEDULED',
        blocksClasses: true,
      },
    ]);

    /* notifications for the demo student and faculty */
    const demoStudent = studentProfiles[0]!;
    await db.insert(s.notifications).values([
      {
        institutionId: inst,
        userId: demoStudent.userId,
        title: 'Classes begin at 11:00 AM tomorrow',
        body: 'Periods 1 and 2 are cancelled due to water supply maintenance.',
        priority: 'CRITICAL',
        category: 'ACADEMIC',
        actionUrl: '/student/announcements',
        groupKey: 'academic-updates',
        isMandatory: true,
        sourceType: 'announcement',
      },
      {
        institutionId: inst,
        userId: demoStudent.userId,
        title: 'Your Financial Management class moved to Room 302',
        body: 'Room 204 is unavailable — projector failure.',
        priority: 'IMPORTANT',
        category: 'ACADEMIC',
        actionUrl: '/student/schedule',
        groupKey: 'academic-updates',
        sourceType: 'change_event',
      },
      {
        institutionId: inst,
        userId: demoStudent.userId,
        title: 'Assignment due in 4 days',
        body: 'Cost of Capital — case analysis (Financial Management).',
        priority: 'NORMAL',
        category: 'ACADEMIC',
        actionUrl: '/student/assignments',
        groupKey: 'assignments',
        sourceType: 'assignment',
      },
      {
        institutionId: inst,
        userId: facultyUsers[0]!.id,
        title: '37 submissions awaiting evaluation',
        body: 'Cost of Capital — case analysis, BBA Finance 3A and 3B.',
        priority: 'NORMAL',
        category: 'ACADEMIC',
        actionUrl: '/faculty/assignments',
        groupKey: 'grading',
        sourceType: 'assignment',
      },
      {
        institutionId: inst,
        userId: admin.id,
        title: '3 grievance cases approaching SLA',
        body: 'Two attendance disputes and one infrastructure request need attention today.',
        priority: 'IMPORTANT',
        category: 'ADMINISTRATIVE',
        actionUrl: '/admin/redressal',
        groupKey: 'grievances',
        sourceType: 'grievance',
      },
    ]);
  }

  async function seedGrievances() {
    console.log('  · grievance categories and live cases…');

    const categoryDefs = [
      { name: 'Attendance', slug: 'attendance', response: 12, resolution: 48, roles: ['STUDENT'], dept: 'MGT' },
      { name: 'Examination', slug: 'examination', response: 12, resolution: 72, roles: ['STUDENT'], dept: null },
      { name: 'Timetable', slug: 'timetable', response: 8, resolution: 24, roles: ['STUDENT', 'FACULTY'], dept: null },
      { name: 'Academic', slug: 'academic', response: 24, resolution: 96, roles: ['STUDENT'], dept: null },
      { name: 'Infrastructure', slug: 'infrastructure', response: 12, resolution: 48, roles: ['STUDENT', 'FACULTY'], dept: null },
      { name: 'IT Support', slug: 'it-support', response: 4, resolution: 24, roles: ['STUDENT', 'FACULTY', 'ADMIN'], dept: null },
      { name: 'Fees & Administration', slug: 'fees-admin', response: 24, resolution: 120, roles: ['STUDENT'], dept: null },
      { name: 'Faculty Workload', slug: 'workload', response: 24, resolution: 96, roles: ['FACULTY'], dept: null },
      { name: 'Wellbeing & Safety', slug: 'wellbeing', response: 4, resolution: 24, roles: ['STUDENT', 'FACULTY'], dept: null, sensitive: true, anonymous: true },
    ];

    const categories = await db
      .insert(s.grievanceCategories)
      .values(
        categoryDefs.map((c, i) => ({
          institutionId: inst,
          name: c.name,
          slug: c.slug,
          description: `${c.name} related issues.`,
          availableToRoles: c.roles,
          defaultDepartmentId: c.dept ? dept[c.dept]! : null,
          defaultAssigneeId: c.slug === 'it-support' ? itSupport.id : c.slug === 'wellbeing' ? counsellor.id : admin.id,
          responseSlaHours: c.response,
          resolutionSlaHours: c.resolution,
          escalationUserId: registrar.id,
          allowAnonymous: c.anonymous ?? false,
          isSensitive: c.sensitive ?? false,
          sortOrder: i,
        })),
      )
      .returning();
    const catBySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

    const demoStudent = studentProfiles[0]!;
    const caseDefs = [
      {
        num: 'CASE-2026-004821',
        cat: 'attendance',
        subject: 'Attendance marked absent on 11 August despite being present',
        description:
          'I attended the Financial Management class on 11 August (Period 2) but the portal shows me absent. My classmates can confirm I was present. Please review and correct.',
        raisedBy: demoStudent.userId,
        status: 'UNDER_REVIEW' as const,
        urgency: 'NORMAL' as const,
        assignee: admin.id,
        createdDaysAgo: 2,
        slaHoursLeft: 6,
      },
      {
        num: 'CASE-2026-004822',
        cat: 'infrastructure',
        subject: 'Projector not working in Room 204',
        description:
          'The projector in Room 204 has not worked for the last four sessions. Slides cannot be shown, which is affecting delivery of the Marketing Management syllabus.',
        raisedBy: facultyUsers[1]!.id,
        status: 'ASSIGNED' as const,
        urgency: 'HIGH' as const,
        assignee: itSupport.id,
        createdDaysAgo: 3,
        slaHoursLeft: -4,
      },
      {
        num: 'CASE-2026-004823',
        cat: 'timetable',
        subject: 'Two classes scheduled at the same time for BCA 3B',
        description:
          'On Thursday Period 5, both Database Systems and Web Technologies appear on our timetable. Please clarify which one we should attend.',
        raisedBy: studentsBySection.get('BCA-3B')![0]!.userId,
        status: 'RESOLVED' as const,
        urgency: 'HIGH' as const,
        assignee: admin.id,
        createdDaysAgo: 6,
        resolution:
          'Confirmed a data entry error in the draft timetable. The published timetable has been corrected and both sections notified.',
      },
      {
        num: 'CASE-2026-004824',
        cat: 'examination',
        subject: 'Request for re-evaluation of internal assessment',
        description:
          'My internal assessment score for Cost Accounting appears lower than the marks on my returned answer script. Requesting verification.',
        raisedBy: studentsBySection.get('BCOM-3A')![2]!.userId,
        status: 'AWAITING_INFORMATION' as const,
        urgency: 'NORMAL' as const,
        assignee: admin.id,
        createdDaysAgo: 4,
        slaHoursLeft: 20,
      },
      {
        num: 'CASE-2026-004825',
        cat: 'it-support',
        subject: 'Cannot access the resource hub from the hostel network',
        description:
          'Resource downloads time out when connected to the hostel wifi. Works on mobile data.',
        raisedBy: studentsBySection.get('BCA-3A')![5]!.userId,
        status: 'SUBMITTED' as const,
        urgency: 'LOW' as const,
        assignee: null,
        createdDaysAgo: 0,
        slaHoursLeft: 4,
      },
      {
        num: 'CASE-2026-004826',
        cat: 'workload',
        subject: 'Teaching load exceeds contracted hours this semester',
        description:
          'My allocated teaching load for this semester is 21 hours against a contracted maximum of 18. Requesting a review before internal assessments begin.',
        raisedBy: facultyUsers[15]!.id,
        status: 'ACKNOWLEDGED' as const,
        urgency: 'HIGH' as const,
        assignee: registrar.id,
        createdDaysAgo: 1,
        slaHoursLeft: 12,
      },
      {
        num: 'CASE-2026-004827',
        cat: 'academic',
        subject: 'Syllabus coverage concern in Operating Systems',
        description:
          'Roughly a third of the Operating Systems syllabus remains uncovered with four weeks of teaching left.',
        raisedBy: studentsBySection.get('BCA-3A')![1]!.userId,
        isAnonymous: true,
        status: 'ASSIGNED' as const,
        urgency: 'NORMAL' as const,
        assignee: admin.id,
        createdDaysAgo: 5,
        slaHoursLeft: 30,
      },
    ];

    for (const def of caseDefs) {
      const cat = catBySlug[def.cat]!;
      const createdAt = addDays(today, -def.createdDaysAgo);
      const resolutionDue = def.slaHoursLeft !== undefined
        ? new Date(today.getTime() + def.slaHoursLeft * 3600_000)
        : addDays(createdAt, 3);

      const [g] = await db
        .insert(s.grievances)
        .values({
          institutionId: inst,
          caseNumber: def.num,
          categoryId: cat.id,
          raisedById: def.raisedBy,
          isAnonymous: def.isAnonymous ?? false,
          subject: def.subject,
          description: def.description,
          urgency: def.urgency,
          status: def.status,
          departmentId: cat.defaultDepartmentId,
          assignedToId: def.assignee,
          assignedAt: def.assignee ? createdAt : null,
          responseDueAt: new Date(createdAt.getTime() + cat.responseSlaHours * 3600_000),
          resolutionDueAt: resolutionDue,
          firstResponseAt: def.status === 'SUBMITTED' ? null : createdAt,
          resolvedAt: def.status === 'RESOLVED' ? addDays(today, -1) : null,
          resolutionSummary: def.resolution ?? null,
          isSlaBreached: (def.slaHoursLeft ?? 1) < 0,
          relatedEntityType: def.cat === 'attendance' ? 'attendance_record' : null,
          createdAt,
        })
        .returning();

      await db.insert(s.grievanceEvents).values({
        institutionId: inst,
        grievanceId: g!.id,
        kind: 'CREATED',
        toValue: 'SUBMITTED',
        actorId: def.raisedBy,
        createdAt,
      });

      if (def.assignee) {
        await db.insert(s.grievanceEvents).values({
          institutionId: inst,
          grievanceId: g!.id,
          kind: 'ASSIGNED',
          toValue: def.assignee,
          actorId: admin.id,
          note: 'Routed by category rules.',
          createdAt,
        });
      }

      if (def.status === 'RESOLVED') {
        await db.insert(s.grievanceEvents).values({
          institutionId: inst,
          grievanceId: g!.id,
          kind: 'STATUS_CHANGED',
          fromValue: 'UNDER_REVIEW',
          toValue: 'RESOLVED',
          actorId: admin.id,
          note: def.resolution,
          createdAt: addDays(today, -1),
        });
        await db.insert(s.grievanceMessages).values({
          institutionId: inst,
          grievanceId: g!.id,
          authorId: admin.id,
          body: def.resolution!,
          createdAt: addDays(today, -1),
        });
      }

      if ((def.slaHoursLeft ?? 1) < 0) {
        await db.insert(s.grievanceEvents).values({
          institutionId: inst,
          grievanceId: g!.id,
          kind: 'SLA_BREACHED',
          toValue: 'ESCALATED',
          isSystemGenerated: true,
          note: 'Resolution deadline passed without a resolution being proposed.',
          createdAt: addDays(today, -1),
        });
      }

      if (def.cat === 'attendance') {
        await db.insert(s.grievanceMessages).values({
          institutionId: inst,
          grievanceId: g!.id,
          authorId: admin.id,
          body: 'Thank you for raising this. We have asked the subject faculty to verify the attendance register for 11 August.',
          createdAt: addDays(today, -1),
        });
      }
    }
  }

  async function seedSkills() {
    console.log('  · skill catalogue, career roles, student profiles…');

    const skillDefs = [
      { name: 'Financial Analysis', slug: 'financial-analysis', category: 'DOMAIN' },
      { name: 'Accounting', slug: 'accounting', category: 'DOMAIN' },
      { name: 'Valuation', slug: 'valuation', category: 'DOMAIN' },
      { name: 'Excel', slug: 'excel', category: 'TOOL' },
      { name: 'SQL', slug: 'sql', category: 'TOOL' },
      { name: 'Python', slug: 'python', category: 'TOOL' },
      { name: 'Data Visualisation', slug: 'data-visualisation', category: 'TECHNICAL' },
      { name: 'Statistics', slug: 'statistics', category: 'ANALYTICAL' },
      { name: 'Problem Solving', slug: 'problem-solving', category: 'ANALYTICAL' },
      { name: 'Written Communication', slug: 'written-communication', category: 'COMMUNICATION' },
      { name: 'Presentation', slug: 'presentation', category: 'COMMUNICATION' },
      { name: 'Teamwork', slug: 'teamwork', category: 'SOFT' },
      { name: 'Programming', slug: 'programming', category: 'TECHNICAL' },
      { name: 'Database Design', slug: 'database-design', category: 'TECHNICAL' },
      { name: 'Marketing Strategy', slug: 'marketing-strategy', category: 'DOMAIN' },
      { name: 'Laboratory Technique', slug: 'laboratory-technique', category: 'TECHNICAL' },
    ];

    const skills = await db
      .insert(s.skills)
      .values(skillDefs.map((sk) => ({ institutionId: inst, ...sk })))
      .returning();
    const skillBySlug = Object.fromEntries(skills.map((sk) => [sk.slug, sk.id]));

    /* subject → skill mapping, so evidence flows automatically */
    await db.insert(s.subjectSkills).values([
      { institutionId: inst, subjectId: subByCode.FIN301!, skillId: skillBySlug['financial-analysis']!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.FIN301!, skillId: skillBySlug.valuation!, weight: 4 },
      { institutionId: inst, subjectId: subByCode.FIN301!, skillId: skillBySlug.excel!, weight: 3 },
      { institutionId: inst, subjectId: subByCode.INV302!, skillId: skillBySlug.valuation!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.STA301!, skillId: skillBySlug.statistics!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.BAN301!, skillId: skillBySlug['problem-solving']!, weight: 4 },
      { institutionId: inst, subjectId: subByCode.DVZ301!, skillId: skillBySlug['data-visualisation']!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.CSA301!, skillId: skillBySlug.programming!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.CSA302!, skillId: skillBySlug['database-design']!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.CSA302!, skillId: skillBySlug.sql!, weight: 4 },
      { institutionId: inst, subjectId: subByCode.CSA305!, skillId: skillBySlug.programming!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.BCM301!, skillId: skillBySlug.presentation!, weight: 4 },
      { institutionId: inst, subjectId: subByCode.BCM301!, skillId: skillBySlug['written-communication']!, weight: 4 },
      { institutionId: inst, subjectId: subByCode.MKT301!, skillId: skillBySlug['marketing-strategy']!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.COM301!, skillId: skillBySlug.accounting!, weight: 5 },
      { institutionId: inst, subjectId: subByCode.BIO303!, skillId: skillBySlug['laboratory-technique']!, weight: 5 },
    ]);

    /* career roles with required profiles */
    const roleDefs = [
      {
        title: 'Financial Analyst',
        slug: 'financial-analyst',
        dept: 'MGT',
        salary: '7.50',
        skills: [
          ['financial-analysis', 85, 5],
          ['valuation', 80, 5],
          ['excel', 80, 5],
          ['accounting', 70, 4],
          ['statistics', 60, 3],
          ['written-communication', 70, 3],
        ],
      },
      {
        title: 'Data Analyst',
        slug: 'data-analyst',
        dept: 'MGT',
        salary: '8.00',
        skills: [
          ['sql', 85, 5],
          ['excel', 80, 4],
          ['statistics', 80, 5],
          ['data-visualisation', 80, 5],
          ['python', 70, 4],
          ['problem-solving', 75, 4],
        ],
      },
      {
        title: 'Software Engineer',
        slug: 'software-engineer',
        dept: 'CSA',
        salary: '9.50',
        skills: [
          ['programming', 90, 5],
          ['problem-solving', 85, 5],
          ['database-design', 70, 4],
          ['sql', 70, 3],
          ['teamwork', 70, 3],
        ],
      },
      {
        title: 'Marketing Executive',
        slug: 'marketing-executive',
        dept: 'MGT',
        salary: '6.00',
        skills: [
          ['marketing-strategy', 80, 5],
          ['presentation', 80, 5],
          ['written-communication', 75, 4],
          ['teamwork', 70, 3],
          ['excel', 60, 2],
        ],
      },
      {
        title: 'Research Associate (Biotech)',
        slug: 'research-associate-biotech',
        dept: 'BIO',
        salary: '5.50',
        skills: [
          ['laboratory-technique', 85, 5],
          ['problem-solving', 75, 4],
          ['written-communication', 70, 4],
          ['statistics', 60, 3],
        ],
      },
    ];

    for (const rd of roleDefs) {
      const [role] = await db
        .insert(s.careerRoles)
        .values({
          institutionId: inst,
          title: rd.title,
          slug: rd.slug,
          description: `Entry-level ${rd.title} role.`,
          departmentId: dept[rd.dept]!,
          averageSalaryLpa: rd.salary,
          sourceNote:
            'Requirement profile compiled by the placement cell from recent job descriptions. Review each placement season.',
        })
        .returning();

      await db.insert(s.careerRoleSkills).values(
        rd.skills.map(([slug, level, importance]) => ({
          institutionId: inst,
          careerRoleId: role!.id,
          skillId: skillBySlug[slug as string]!,
          requiredProficiency: level as number,
          importance: importance as number,
          isCore: (importance as number) >= 4,
        })),
      );
    }

    /* skill profiles for BBA Finance 3A + BCA 3A (enough to demonstrate) */
    const focusSections = ['BBAF-3A', 'BCA-3A'];
    const evidenceRows: (typeof s.skillEvidence.$inferInsert)[] = [];
    const studentSkillRows: (typeof s.studentSkills.$inferInsert)[] = [];

    for (const sectionCode of focusSections) {
      const list = studentsBySection.get(sectionCode) ?? [];
      const relevant =
        sectionCode === 'BBAF-3A'
          ? ['financial-analysis', 'valuation', 'excel', 'accounting', 'statistics', 'written-communication', 'presentation', 'teamwork']
          : ['programming', 'database-design', 'sql', 'problem-solving', 'python', 'teamwork', 'written-communication'];

      for (const sp of list) {
        const aptitude = 0.45 + rand() * 0.5;
        for (const slug of relevant) {
          const base = Math.round(aptitude * 100 + (rand() * 24 - 12));
          const proficiency = Math.max(12, Math.min(97, base));
          const evidenceCount = randInt(2, 5);

          studentSkillRows.push({
            institutionId: inst,
            studentId: sp.id,
            skillId: skillBySlug[slug]!,
            proficiency,
            confidence: Math.min(95, 40 + evidenceCount * 12),
            evidenceCount,
            lastEvidenceAt: addDays(today, -randInt(1, 30)),
          });

          for (let e = 0; e < evidenceCount; e += 1) {
            evidenceRows.push({
              institutionId: inst,
              studentId: sp.id,
              skillId: skillBySlug[slug]!,
              source: pick(['ASSESSMENT', 'ASSIGNMENT', 'COURSE_OUTCOME', 'FACULTY_ASSESSMENT'] as const),
              score: Math.max(10, Math.min(100, proficiency + randInt(-14, 14))),
              weight: randInt(1, 3),
              description: 'Derived from coursework performance.',
              recordedAt: addDays(today, -randInt(1, 60)),
            });
          }
        }
      }
    }

    for (let i = 0; i < studentSkillRows.length; i += 500) {
      await db.insert(s.studentSkills).values(studentSkillRows.slice(i, i + 500));
    }
    for (let i = 0; i < evidenceRows.length; i += 1000) {
      await db.insert(s.skillEvidence).values(evidenceRows.slice(i, i + 1000));
    }

    /* career goals */
    const roles = await db.select().from(s.careerRoles).where(eq(s.careerRoles.institutionId, inst));
    const finRole = roles.find((r) => r.slug === 'financial-analyst')!;
    const swRole = roles.find((r) => r.slug === 'software-engineer')!;

    const goalRows: (typeof s.careerGoals.$inferInsert)[] = [];
    for (const sp of studentsBySection.get('BBAF-3A') ?? []) {
      if (chance(0.7)) {
        goalRows.push({
          institutionId: inst,
          studentId: sp.id,
          careerRoleId: finRole.id,
          isPrimary: true,
          targetDate: '2028-04-30',
        });
      }
    }
    for (const sp of studentsBySection.get('BCA-3A') ?? []) {
      if (chance(0.7)) {
        goalRows.push({
          institutionId: inst,
          studentId: sp.id,
          careerRoleId: swRole.id,
          isPrimary: true,
          targetDate: '2028-04-30',
        });
      }
    }
    if (goalRows.length) await db.insert(s.careerGoals).values(goalRows);

    await db.insert(s.studentCertifications).values([
      {
        institutionId: inst,
        studentId: studentProfiles[0]!.id,
        title: 'Financial Modelling & Valuation — Foundations',
        issuer: 'NSE Academy',
        issuedOn: '2026-05-20',
        skillTags: ['Valuation', 'Excel'],
        verifiedById: facultyUsers[0]!.id,
        verifiedAt: addDays(today, -20),
      },
      {
        institutionId: inst,
        studentId: studentProfiles[0]!.id,
        title: 'Excel for Business Analysis',
        issuer: 'Coursera',
        issuedOn: '2026-03-11',
        skillTags: ['Excel'],
      },
    ]);
  }

  async function seedWorkload() {
    console.log('  · faculty workload…');

    const workloadRows: (typeof s.workloadRecords.$inferInsert)[] = [];
    const perFaculty = new Map<string, { teaching: number; lab: number; assessment: number; admin: number; mentoring: number }>();

    for (let i = 0; i < offerings.length; i += 1) {
      const offering = offerings[i]!;
      const plan = offeringPlan[i]!;
      const subjectDef = subjectDefs.find((x) => x.code === plan.subject)!;
      const facultyId = offering.facultyId!;

      const agg = perFaculty.get(facultyId) ?? { teaching: 0, lab: 0, assessment: 0, admin: 0, mentoring: 0 };
      if (subjectDef.kind === 'LAB') agg.lab += subjectDef.hours;
      else agg.teaching += subjectDef.hours;
      // Assessment effort scales with class size.
      agg.assessment += Math.round(sectionDefs.find((x) => x.code === plan.section)!.strength / 22);
      perFaculty.set(facultyId, agg);

      workloadRows.push({
        institutionId: inst,
        facultyId,
        termId: term!.id,
        kind: subjectDef.kind === 'LAB' ? 'LAB' : 'TEACHING',
        description: `${plan.subject} ${subjectDef.name} — ${plan.section}`,
        weeklyHours: String(subjectDef.hours),
        source: 'DERIVED',
        sourceType: 'course_offering',
        sourceId: offering.id,
        offeringId: offering.id,
      });
    }

    // Administrative duties, entered manually by the office.
    const adminDuties: [string, string, number][] = [
      ['F001', 'Head of Department — Management Studies', 4],
      ['F007', 'Head of Department — Computer Applications', 4],
      ['F012', 'Head of Department — Biotechnology', 4],
      ['F004', 'Examination coordinator', 3],
      ['F016', 'Timetable coordinator', 3],
      ['F009', 'Placement coordinator', 2],
      ['F014', 'Laboratory in-charge', 2],
    ];
    for (const [code, description, hours] of adminDuties) {
      workloadRows.push({
        institutionId: inst,
        facultyId: facByCode[code]!,
        termId: term!.id,
        kind: 'ADMINISTRATIVE',
        description,
        weeklyHours: String(hours),
        source: 'MANUAL',
      });
      const agg = perFaculty.get(facByCode[code]!) ?? { teaching: 0, lab: 0, assessment: 0, admin: 0, mentoring: 0 };
      agg.admin += hours;
      perFaculty.set(facByCode[code]!, agg);
    }

    // Mentoring load: each faculty member mentors a group of students.
    for (const f of facultyDefs) {
      const hours = 1;
      workloadRows.push({
        institutionId: inst,
        facultyId: facByCode[f.code]!,
        termId: term!.id,
        kind: 'MENTORING',
        description: 'Student mentoring group',
        weeklyHours: String(hours),
        source: 'MANUAL',
      });
      const agg = perFaculty.get(facByCode[f.code]!) ?? { teaching: 0, lab: 0, assessment: 0, admin: 0, mentoring: 0 };
      agg.mentoring += hours;
      perFaculty.set(facByCode[f.code]!, agg);
    }

    await db.insert(s.workloadRecords).values(workloadRows);

    // Department averages, then per-faculty status.
    const facultyDept = new Map(facultyDefs.map((f) => [facByCode[f.code]!, f.dept]));
    const deptTotals = new Map<string, number[]>();
    const totals = new Map<string, number>();

    for (const [facultyId, agg] of perFaculty) {
      const total = agg.teaching + agg.lab + agg.assessment + agg.admin + agg.mentoring;
      totals.set(facultyId, total);
      const d = facultyDept.get(facultyId) ?? 'MGT';
      const list = deptTotals.get(d) ?? [];
      list.push(total);
      deptTotals.set(d, list);
    }

    const summaryRows: (typeof s.workloadSummaries.$inferInsert)[] = [];
    for (const [facultyId, agg] of perFaculty) {
      const total = totals.get(facultyId)!;
      const d = facultyDept.get(facultyId) ?? 'MGT';
      const list = deptTotals.get(d) ?? [total];
      const avg = list.reduce((a, b) => a + b, 0) / list.length;
      const def = facultyDefs.find((f) => facByCode[f.code] === facultyId)!;
      const max = def.designation === 'Professor' ? 14 : 18;
      const utilisation = (total / max) * 100;

      summaryRows.push({
        institutionId: inst,
        facultyId,
        termId: term!.id,
        teachingHours: String(agg.teaching),
        labHours: String(agg.lab),
        assessmentHours: String(agg.assessment),
        administrativeHours: String(agg.admin),
        mentoringHours: String(agg.mentoring),
        otherHours: '0',
        totalHours: String(total),
        departmentAverage: avg.toFixed(2),
        utilizationPercentage: utilisation.toFixed(2),
        status:
          utilisation >= 125 ? 'CRITICAL' : utilisation >= 105 ? 'HIGH' : utilisation < 55 ? 'UNDERLOADED' : 'BALANCED',
      });
    }
    await db.insert(s.workloadSummaries).values(summaryRows);

    /* a pending leave request that has real consequences */
    await db.insert(s.leaveRequests).values({
      institutionId: inst,
      requesterId: facultyUsers[4]!.id,
      reference: 'LEAVE-2026-00312',
      leaveType: 'DUTY',
      fromDate: dateOnly(addDays(today, 2)),
      toDate: dateOnly(addDays(today, 2)),
      reason: 'Attending the NAAC accreditation workshop as an institutional representative.',
      status: 'PENDING',
      affectedClassCount: 2,
    });

    /* a pending approval so the admin dashboard has real work */
    await db.insert(s.approvals).values({
      institutionId: inst,
      kind: 'LEAVE_REQUEST',
      status: 'PENDING',
      title: 'Leave request — Deepa Joshi (21 August)',
      description: 'Duty leave for the NAAC accreditation workshop. Two classes need cover.',
      payload: { reference: 'LEAVE-2026-00312' },
      impactSummary: { classesAffected: 2, studentsAffected: 92, sections: ['BBAF-3A', 'BBAF-3B'] },
      entityType: 'leave_request',
      requestedById: facultyUsers[4]!.id,
      requiredRole: 'ADMIN',
    });
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\nSeed failed:', error);
    await pool.end();
    process.exit(1);
  });
