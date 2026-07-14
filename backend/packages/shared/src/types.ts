// Shared domain types / DTOs used across services (and later, the frontend).
// Keep these transport-shaped (what the API returns), not storage-shaped.

export type Role = 'student' | 'mentor' | 'admin';

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
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
