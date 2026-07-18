// Shared domain types / DTOs used across services (and later, the frontend).
// Keep these transport-shaped (what the API returns), not storage-shaped.

// Role hierarchy: superadmin ⊇ admin ⊇ student. `mentor` is legacy/additive — a mentor is
// a student who ALSO has an approved mentor profile (see marketplace), not a distinct role.
export type Role = 'student' | 'mentor' | 'admin' | 'superadmin';

/** Fine-grained admin permission scopes (superadmin implicitly has all + `admins.manage`). */
export const ADMIN_SCOPES = [
  'mentors.manage', 'mentors.interview', 'sessions.view', 'payments.view',
  'users.view', 'broadcast.send', 'content.manage',
] as const;
export type AdminScope = (typeof ADMIN_SCOPES)[number];

export type Category = 'Open' | 'OBC-NCL' | 'SC' | 'ST' | 'EWS';
export type Gender = 'Male' | 'Female';
export type Priority = 'branch' | 'college';

/** The student inputs that power the predictor (mirrors the frontend profile). */
export interface RankPrefs {
  advRank: number;
  mainRank: number;
  category: Category;
  home: string; // home state
  gender: Gender;
  pwd: boolean;
  branches: string[];
  priority: Priority;
}

/** Public user profile shape returned by auth-identity. */
export interface UserProfile {
  userId: string;
  role: Role;
  name?: string;
  email?: string;
  phone?: string;
  rankPrefs?: RankPrefs;
  /** Admin permission scopes (only meaningful when role === 'admin'). */
  permissions?: string[];
  onboardedAt?: string; // set when the student/mentor completes onboarding
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
