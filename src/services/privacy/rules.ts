/**
 * PRIVACY RULES — pure functions, unit-tested, shared by every module that
 * shows one student's data to another person (leaderboards, profiles, clubs).
 */
import { AI_COACH_SCOPES, type AiCoachScope, type ConsentPurpose } from './catalogue';

export type LeaderboardVisibility = 'PUBLIC' | 'ANONYMOUS' | 'PRIVATE' | 'OPT_OUT';

export interface PrivacyPrefs {
  leaderboardVisibility: LeaderboardVisibility;
  profileVisibility: 'INSTITUTION' | 'PRIVATE';
  showStreaks: boolean;
  showAchievements: boolean;
  showEventParticipation: boolean;
  personalizedRecommendations: boolean;
  aiMemoryEnabled: boolean;
  aiCoachScopes: AiCoachScope[];
}

/** Privacy-protective defaults: nothing optional is visible to others until the student opts in. */
export const PRIVACY_DEFAULTS: PrivacyPrefs = {
  leaderboardVisibility: 'PRIVATE',
  profileVisibility: 'INSTITUTION',
  showStreaks: false,
  showAchievements: true,
  showEventParticipation: false,
  personalizedRecommendations: true,
  aiMemoryEnabled: false,
  aiCoachScopes: [],
};

/** Which consent-ledger entries a preference change produces. */
export function consentChanges(before: PrivacyPrefs, after: PrivacyPrefs): { purpose: ConsentPurpose; granted: boolean }[] {
  const out: { purpose: ConsentPurpose; granted: boolean }[] = [];
  const flip = (purpose: ConsentPurpose, a: boolean, b: boolean) => {
    if (a !== b) out.push({ purpose, granted: b });
  };
  flip('personalized_recommendations', before.personalizedRecommendations, after.personalizedRecommendations);
  flip('ai_memory', before.aiMemoryEnabled, after.aiMemoryEnabled);
  const onBoard = (v: LeaderboardVisibility) => v === 'PUBLIC' || v === 'ANONYMOUS';
  flip('leaderboard_participation', onBoard(before.leaderboardVisibility), onBoard(after.leaderboardVisibility));
  flip('public_streaks', before.showStreaks, after.showStreaks);
  flip('public_event_participation', before.showEventParticipation, after.showEventParticipation);
  for (const scope of AI_COACH_SCOPES) {
    flip(`ai_coach:${scope}`, before.aiCoachScopes.includes(scope), after.aiCoachScopes.includes(scope));
  }
  return out;
}

/**
 * How (and whether) a student appears on a leaderboard shown to someone else.
 * The viewer always sees themselves, labelled as such, regardless of setting.
 */
export function leaderboardIdentity(
  prefs: Pick<PrivacyPrefs, 'leaderboardVisibility'>,
  subject: { userId: string; displayName: string },
  viewerId: string,
): { visible: boolean; label: string; isSelf: boolean } {
  const isSelf = subject.userId === viewerId;
  if (isSelf) return { visible: prefs.leaderboardVisibility !== 'OPT_OUT', label: `${subject.displayName} (you)`, isSelf };
  switch (prefs.leaderboardVisibility) {
    case 'PUBLIC':
      return { visible: true, label: subject.displayName, isSelf };
    case 'ANONYMOUS':
      return { visible: true, label: anonymousHandle(subject.userId), isSelf };
    default:
      return { visible: false, label: '', isSelf };
  }
}

/** Stable, non-reversible pseudonym, e.g. "Student 4F2A". */
export function anonymousHandle(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `Student ${(h >>> 0).toString(16).toUpperCase().slice(-4).padStart(4, '0')}`;
}

/**
 * Fields another member of the institution may see on a student's profile.
 * Attendance, grades and private goals are NEVER in this list, whatever the
 * settings — they are not the student's to publish through CampusOS.
 */
export type ProfileField = 'name' | 'program' | 'skills' | 'achievements' | 'streaks' | 'events' | 'clubs' | 'certificates';

export function visibleProfileFields(prefs: PrivacyPrefs, viewerIsSelf: boolean): ProfileField[] {
  const all: ProfileField[] = ['name', 'program', 'skills', 'achievements', 'streaks', 'events', 'clubs', 'certificates'];
  if (viewerIsSelf) return all;
  if (prefs.profileVisibility === 'PRIVATE') return ['name'];
  const fields: ProfileField[] = ['name', 'program', 'skills', 'clubs', 'certificates'];
  if (prefs.showAchievements) fields.push('achievements');
  if (prefs.showStreaks) fields.push('streaks');
  if (prefs.showEventParticipation) fields.push('events');
  return fields;
}

/** Categories that must never be shown to anyone but the student and authorised staff. */
export const NEVER_PUBLIC = ['attendance', 'grades', 'private_goals', 'personal_tracking', 'library_history'] as const;
