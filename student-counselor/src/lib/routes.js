// ══════════════════════════════════════════════════════════════════════════
// Screen ids <-> URL slugs, and the role/context each screen belongs to.
// A single optional-catch-all route ( app/[[...slug]] ) reads the slug and looks
// up the screen component; navigate(id) pushes the slug for that id.
// ══════════════════════════════════════════════════════════════════════════

// camelCase id -> kebab-case slug (bijective for our ids), gallery -> '' (root).
export function idToSlug(id) {
  // Landing is the site root (/). The dev screen-gallery moves to /gallery/.
  if (!id || id === 'landing') return '';
  return id.replace(/([A-Z])/g, '-$1').toLowerCase();
}
export function slugToId(slug) {
  if (!slug) return 'landing';
  return slug.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}
export function idToPath(id) {
  const slug = idToSlug(id);
  // Trailing slash to match next.config `trailingSlash: true` (static export URLs).
  return slug ? '/' + slug + '/' : '/';
}

// Every screen id in the product.
export const ALL_SCREENS = [
  'gallery',
  'landing', 'howItWorks', 'features', 'becomeMentor', 'pricing', 'guides', 'about', 'faq', 'contact', 'legal',
  'signup', 'login', 'otp', 'reset', 'roleSelect', 'onboarding', 'mentorOnboarding', 'verifyStatus',
  'dashboard', 'profile', 'predictor', 'filters', 'collegeDetail', 'collegeExplorer', 'compare', 'shortlist', 'choiceBuilder', 'choiceExport', 'marketplace', 'aiCounsellor', 'mentorProfile', 'booking', 'payment', 'bookingConfirm', 'sessions', 'sessionRoom', 'rateSession', 'timeline', 'notifications', 'help', 'settings', 'receipts',
  'mDashboard', 'mProfile', 'mAvailability', 'mVerification', 'mBookings', 'mSession', 'mStudents', 'mEarnings', 'mReviews', 'mNotifications', 'mSettings',
  'aDashboard', 'aStudents', 'aMentors', 'aVerifyQueue', 'aInterviews', 'aAudit', 'aCollegeData', 'aContent', 'aSessions', 'aPayments', 'aModeration', 'aSupport', 'aCms', 'aBroadcast', 'aAnalytics', 'aSettings', 'aAdmins',
  'emptyStates', 'loading', 'errorPages', 'confirmations', 'coachMarks', 'navPatterns',
];

const CTX = {
  gallery: 'gallery',
  landing: 'marketing', howItWorks: 'marketing', features: 'marketing', becomeMentor: 'marketing', pricing: 'marketing', guides: 'marketing', about: 'marketing', faq: 'marketing', contact: 'marketing', legal: 'marketing',
  signup: 'auth', login: 'auth', otp: 'auth', reset: 'auth', roleSelect: 'auth', onboarding: 'auth', mentorOnboarding: 'auth', verifyStatus: 'auth',
  dashboard: 'student', profile: 'student', predictor: 'student', filters: 'student', collegeDetail: 'student', collegeExplorer: 'student', compare: 'student', shortlist: 'student', choiceBuilder: 'student', choiceExport: 'student', marketplace: 'student', aiCounsellor: 'student', mentorProfile: 'student', booking: 'student', payment: 'student', bookingConfirm: 'student', sessions: 'student', sessionRoom: 'student', rateSession: 'student', timeline: 'student', notifications: 'student', help: 'student', settings: 'student', receipts: 'student',
  mDashboard: 'mentor', mProfile: 'mentor', mAvailability: 'mentor', mVerification: 'mentor', mBookings: 'mentor', mSession: 'mentor', mStudents: 'mentor', mEarnings: 'mentor', mReviews: 'mentor', mNotifications: 'mentor', mSettings: 'mentor',
  aDashboard: 'admin', aStudents: 'admin', aMentors: 'admin', aVerifyQueue: 'admin', aInterviews: 'admin', aAudit: 'admin', aCollegeData: 'admin', aContent: 'admin', aSessions: 'admin', aPayments: 'admin', aModeration: 'admin', aSupport: 'admin', aCms: 'admin', aBroadcast: 'admin', aAnalytics: 'admin', aSettings: 'admin', aAdmins: 'admin',
  emptyStates: 'system', loading: 'system', errorPages: 'system', confirmations: 'system', coachMarks: 'system', navPatterns: 'system',
};

export function ctxOf(screen) {
  return CTX[screen] || 'gallery';
}
