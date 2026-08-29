// Screen registry — maps every screen id to its component.
import Gallery from './gallery';
import * as M from './marketing';
import * as A from './auth';
import * as S from './student';
import * as ME from './mentor';
import * as AD from './admin';
import * as SY from './system';

export const SCREENS = {
  gallery: Gallery,

  // Public & Marketing
  landing: M.Landing,
  howItWorks: M.HowItWorks,
  features: M.Features,
  becomeMentor: M.BecomeMentor,
  pricing: M.Pricing,
  guides: M.Guides,
  about: M.About,
  faq: M.Faq,
  contact: M.Contact,
  legal: M.Legal,

  // Auth & Onboarding
  signup: A.Signup,
  login: A.Login,
  otp: A.Otp,
  reset: A.Reset,
  roleSelect: A.RoleSelect,
  onboarding: A.Onboarding,
  mentorOnboarding: A.MentorOnboarding,
  verifyStatus: A.VerifyStatus,

  // Student app
  dashboard: S.Dashboard,
  profile: S.Profile,
  predictor: S.Predictor,
  filters: S.Filters,
  collegeDetail: S.CollegeDetail,
  collegeExplorer: S.CollegeExplorer,
  compare: S.Compare,
  shortlist: S.Shortlist,
  choiceBuilder: S.ChoiceBuilder,
  choiceExport: S.ChoiceExport,
  marketplace: S.Marketplace,
  aiCounsellor: S.AICounsellor,
  mentorProfile: S.MentorProfile,
  booking: S.Booking,
  payment: S.Payment,
  bookingConfirm: S.BookingConfirm,
  sessions: S.Sessions,
  sessionRoom: S.SessionRoom,
  rateSession: S.RateSession,
  timeline: S.Timeline,
  notifications: S.Notifications,
  help: S.Help,
  settings: S.Settings,
  receipts: S.Receipts,

  // Mentor app
  mDashboard: ME.MDashboard,
  mProfile: ME.MProfile,
  mAvailability: ME.MAvailability,
  mVerification: ME.MVerification,
  mBookings: ME.MBookings,
  mSession: ME.MSession,
  mStudents: ME.MStudents, // Phase 11: students & prep
  mEarnings: ME.MEarnings,
  mReviews: ME.MReviews,
  mNotifications: ME.MNotifications,
  mSettings: ME.MSettings,

  // Super Admin
  aDashboard: AD.ADashboard,
  aStudents: AD.AStudents,
  aMentors: AD.AMentors,
  aVerifyQueue: AD.AVerifyQueue,
  aInterviews: AD.AInterviews, // Phase 11: interview calendar
  aAudit: AD.AAudit,           // Phase 11: audit log
  aCollegeData: AD.ACollegeData,
  aContent: AD.AContent,
  aSessions: AD.ASessions,
  aPayments: AD.APayments,
  aModeration: AD.AModeration,
  aSupport: AD.ASupport,
  aCms: AD.ACms,
  aBroadcast: AD.ABroadcast,
  aAnalytics: AD.AAnalytics,
  aSettings: AD.ASettings,
  aAdmins: AD.AAdmins,

  // Shared & System
  emptyStates: SY.EmptyStates,
  loading: SY.Loading,
  errorPages: SY.ErrorPages,
  confirmations: SY.Confirmations,
  coachMarks: SY.CoachMarks,
  navPatterns: SY.NavPatterns,
};
