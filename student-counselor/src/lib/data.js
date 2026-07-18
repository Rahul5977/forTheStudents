// ══════════════════════════════════════════════════════════════════════════
// Dummy data — ported verbatim from the design prototype (Student-Counselor.dc.html).
// No backend: everything the app shows lives here.
// ══════════════════════════════════════════════════════════════════════════

// College-branch rows. exam: 'adv' uses JEE Advanced rank, 'main' uses JEE Main rank.
// [name, type, city, state, nirf, estd, branch, exam, close, fees(L), avg(LPA), high(Cr), rate]
const RAW_COLLEGES = [
  ['IIT Bombay', 'IIT', 'Mumbai', 'Maharashtra', 3, 1958, 'Computer Science', 'adv', 68, 2.3, 32.5, 1.8, '99%'],
  ['IIT Delhi', 'IIT', 'New Delhi', 'Delhi', 2, 1961, 'Computer Science', 'adv', 115, 2.3, 31.2, 1.9, '98%'],
  ['IIT Madras', 'IIT', 'Chennai', 'Tamil Nadu', 1, 1959, 'Computer Science', 'adv', 158, 2.2, 30.1, 1.7, '97%'],
  ['IIT Kanpur', 'IIT', 'Kanpur', 'Uttar Pradesh', 4, 1959, 'Computer Science', 'adv', 237, 2.2, 29.8, 1.6, '96%'],
  ['IIT Roorkee', 'IIT', 'Roorkee', 'Uttarakhand', 6, 1847, 'Electronics', 'adv', 1123, 2.1, 22.4, 0.9, '92%'],
  ['IIT (BHU) Varanasi', 'IIT', 'Varanasi', 'Uttar Pradesh', 12, 1919, 'Computer Science', 'adv', 1024, 2.1, 24.6, 1.1, '93%'],
  ['IIT Indore', 'IIT', 'Indore', 'Madhya Pradesh', 16, 2009, 'Computer Science', 'adv', 1567, 1.9, 21.8, 0.8, '90%'],
  ['IIT Hyderabad', 'IIT', 'Hyderabad', 'Telangana', 8, 2008, 'Computer Science', 'adv', 601, 2.0, 27.9, 1.4, '95%'],
  ['IIT Guwahati', 'IIT', 'Guwahati', 'Assam', 7, 1994, 'Computer Science', 'adv', 634, 2.1, 26.5, 1.3, '94%'],
  ['IIT Delhi', 'IIT', 'New Delhi', 'Delhi', 2, 1961, 'Mechanical', 'adv', 1789, 2.3, 18.7, 0.7, '88%'],
  ['NIT Trichy', 'NIT', 'Tiruchirappalli', 'Tamil Nadu', 9, 1964, 'Computer Science', 'main', 1198, 1.6, 20.4, 0.9, '94%'],
  ['NIT Warangal', 'NIT', 'Warangal', 'Telangana', 21, 1959, 'Computer Science', 'main', 1876, 1.5, 18.9, 0.8, '93%'],
  ['NIT Surathkal', 'NIT', 'Mangalore', 'Karnataka', 17, 1960, 'Computer Science', 'main', 2134, 1.6, 19.6, 0.85, '93%'],
  ['NIT Rourkela', 'NIT', 'Rourkela', 'Odisha', 19, 1961, 'Computer Science', 'main', 4521, 1.5, 15.8, 0.7, '90%'],
  ['VNIT Nagpur', 'NIT', 'Nagpur', 'Maharashtra', 26, 1960, 'Computer Science', 'main', 5678, 1.4, 13.9, 0.6, '88%'],
  ['NIT Calicut', 'NIT', 'Kozhikode', 'Kerala', 23, 1961, 'Computer Science', 'main', 5342, 1.5, 14.7, 0.65, '89%'],
  ['NIT Trichy', 'NIT', 'Tiruchirappalli', 'Tamil Nadu', 9, 1964, 'Electronics', 'main', 3421, 1.6, 16.2, 0.7, '91%'],
  ['MNNIT Allahabad', 'NIT', 'Prayagraj', 'Uttar Pradesh', 49, 1961, 'Computer Science', 'main', 6234, 1.4, 13.1, 0.55, '87%'],
  ['NIT Warangal', 'NIT', 'Warangal', 'Telangana', 21, 1959, 'Electronics', 'main', 4123, 1.5, 14.4, 0.6, '89%'],
  ['IIIT Hyderabad', 'IIIT', 'Hyderabad', 'Telangana', 0, 1998, 'Computer Science', 'main', 420, 2.4, 33.6, 2.1, '99%'],
  ['IIIT Allahabad', 'IIIT', 'Prayagraj', 'Uttar Pradesh', 0, 1999, 'Computer Science', 'main', 4987, 1.4, 15.2, 0.7, '90%'],
  ['IIIT Gwalior', 'IIIT', 'Gwalior', 'Madhya Pradesh', 0, 1997, 'Computer Science', 'main', 8234, 1.3, 11.8, 0.5, '85%'],
  ['IIEST Shibpur', 'GFTI', 'Howrah', 'West Bengal', 37, 1856, 'Computer Science', 'main', 6789, 1.2, 12.9, 0.55, '86%'],
  ['NIT Delhi', 'NIT', 'New Delhi', 'Delhi', 45, 2010, 'Computer Science', 'main', 3890, 1.4, 16.6, 0.75, '89%'],
  ['IIT Kharagpur', 'IIT', 'Kharagpur', 'West Bengal', 5, 1951, 'Electrical', 'adv', 1456, 2.2, 23.1, 1.0, '93%'],
  ['NIT Surathkal', 'NIT', 'Mangalore', 'Karnataka', 17, 1960, 'Electronics', 'main', 5210, 1.6, 15.1, 0.65, '90%'],
];

export const COLLEGES = RAW_COLLEGES.map((r, i) => ({
  id: i + 1,
  college: r[0],
  type: r[1],
  city: r[2],
  state: r[3],
  nirf: r[4],
  estd: r[5],
  branch: r[6],
  exam: r[7],
  close: r[8],
  fees: r[9],
  avg: r[10],
  high: r[11],
  rate: r[12],
}));

// ── All Indian states + UTs — the single source of truth for every home-state /
// state-filter dropdown. Spellings match the backend JoSAA dataset so the exact
// state filter lines up; the Home-State quota match is punctuation-tolerant. ──
export const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland',
  'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  // Union Territories
  'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Gender pools. Only 'Female' unlocks the JoSAA Female-only (supernumerary) seats;
// everyone else is judged against Gender-Neutral seats.
export const GENDERS = ['Male', 'Female', 'Other'];

// [name, college, ctype, branch, year, rating, sessions, price, initials, color, topics, langs]
const RAW_MENTORS = [
  ['Aarav Sharma', 'IIT Bombay', 'IIT', 'Computer Science', 3, 4.9, 128, 100, 'AS', '#c67139', ['CSE vs ECE', 'Campus life', 'Placements'], ['Hindi', 'English']],
  ['Priya Menon', 'IIT Madras', 'IIT', 'Electrical', 4, 4.8, 96, 100, 'PM', '#7a8a5e', ['Branch choice', 'Research', 'Hostel'], ['English', 'Tamil']],
  ['Rohan Gupta', 'NIT Trichy', 'NIT', 'Computer Science', 3, 4.7, 74, 100, 'RG', '#b2622d', ['NIT vs IIT', 'Coding culture', 'Internships'], ['Hindi', 'English']],
  ['Ananya Rao', 'IIIT Hyderabad', 'IIIT', 'Computer Science', 2, 4.9, 143, 100, 'AR', '#728157', ['Research', 'Dual degree', 'Startups'], ['English', 'Telugu']],
  ['Karthik Iyer', 'IIT Delhi', 'IIT', 'Mechanical', 4, 4.6, 58, 100, 'KI', '#8c491a', ['Core vs coding', 'Higher studies', 'Campus'], ['Hindi', 'English']],
  ['Sneha Patil', 'VNIT Nagpur', 'NIT', 'Computer Science', 3, 4.8, 61, 100, 'SP', '#56633f', ['Home-state quota', 'Placements', 'City life'], ['Marathi', 'Hindi', 'English']],
];

export const MENTORS = RAW_MENTORS.map((r, i) => ({
  id: i + 1,
  name: r[0],
  college: r[1],
  ctype: r[2],
  branch: r[3],
  year: r[4],
  rating: r[5],
  sessions: r[6],
  price: r[7],
  initials: r[8],
  color: r[9],
  topics: r[10],
  langs: r[11],
  verified: true,
  nextSlot: 'Today 6:30 PM',
  earnTxt: (r[6] * 80).toLocaleString('en-IN'),
}));

// ── Static list data used across screens ──────────────────────────────────

export const PILLARS = [
  { icon: '🎯', title: 'Predict', body: 'Enter your rank, instantly see the IITs, NITs, IIITs and GFTIs you can realistically get — sorted Safe, Target, Reach.', go: 'predictor', cta: 'Try the predictor' },
  { icon: '📋', title: 'Plan', body: 'Build and reorder your official JoSAA choice list with drag-and-drop, with the List Doctor warning you of risky lists.', go: 'choiceBuilder', cta: 'Open the builder' },
  { icon: '💬', title: 'Talk', body: 'Book a 25-minute 1:1 video call with a verified current student of a college for honest, insider advice.', go: 'marketplace', cta: 'Find a senior' },
];

export const JOURNEY = [
  { n: 1, title: 'Result day', body: 'Your JEE Main / Advanced ranks are out. Deep breath — here’s where it starts.' },
  { n: 2, title: 'Predict', body: 'Enter your rank; see every realistic college-branch, bucketed Safe / Target / Reach.' },
  { n: 3, title: 'Shortlist', body: 'Save the ones you like and read honest analysis + reviews from seniors.' },
  { n: 4, title: 'Build & lock choices', body: 'Order your JoSAA list with drag-and-drop; the List Doctor catches risky lists.' },
  { n: 5, title: 'Talk to a senior', body: 'Still unsure? Book a 25-min call with a verified current student.' },
  { n: 6, title: 'Rounds & decide', body: 'Follow round deadlines, understand Freeze / Float / Slide, and lock your seat.' },
];

export const FEATURE_CARDS = [
  { icon: '🎯', title: 'College Predictor', body: 'Rank-based predictions across IITs, NITs, IIITs and GFTIs with live filters.', go: 'predictor' },
  { icon: '📋', title: 'Choice-List Builder', body: 'Drag-and-drop ordering with the List Doctor and a projected allotment.', go: 'choiceBuilder' },
  { icon: '📊', title: 'College Analysis', body: 'Cutoff trends with your rank marked, placements, fees and honest pros/cons.', go: 'collegeDetail' },
  { icon: '💬', title: 'Mentor Calls', body: '25-minute 1:1 video calls with verified current students of any college.', go: 'marketplace' },
];

export const GUIDES = [
  { cat: 'Branch guide', title: 'CSE vs ECE: which should you pick?', excerpt: 'A frank look at coursework, placements and long-term flexibility.', read: '6 min read' },
  { cat: 'Cutoffs', title: 'NIT cutoff trends 2020–2025', excerpt: 'How closing ranks have shifted across the top NITs.', read: '8 min read' },
  { cat: 'How-to', title: 'Filling JoSAA choices without regret', excerpt: 'A step-by-step guide to a safe, ambitious choice list.', read: '5 min read' },
  { cat: 'College review', title: 'Life at IIT Bombay, honestly', excerpt: 'Academics, hostels, clubs and the pressure — from a current student.', read: '7 min read' },
];

export const TEAM = [
  { i: 'RS', name: 'Rohan S.', role: 'Founder · IIT alum', color: '#c67139' },
  { i: 'MP', name: 'Maya P.', role: 'Product', color: '#7a8a5e' },
  { i: 'AK', name: 'Arjun K.', role: 'Data & cutoffs', color: '#b2622d' },
];

export const EMPTY_CARDS = [
  { icon: '🔍', title: 'No results', body: 'No colleges match these filters. Try loosening one.', cta: 'Clear filters' },
  { icon: '♡', title: 'Empty shortlist', body: 'Save colleges from the predictor to hold them here.', cta: 'Open predictor' },
  { icon: '📋', title: 'No choice list yet', body: 'Add your first colleges to start building.', cta: 'Add colleges' },
  { icon: '💬', title: 'No mentors match', body: 'No seniors for this filter — try nearby options.', cta: 'Widen search' },
];

export const M_REVIEWS = [
  { name: 'Riya · IIT Bombay CSE aspirant', stars: '⭐⭐⭐⭐⭐', text: 'Cleared all my doubts about CSE. Super honest and patient!' },
  { name: 'Dev', stars: '⭐⭐⭐⭐⭐', text: 'Best ₹100 I spent this counselling season. Told me things no blog would.' },
  { name: 'Sana', stars: '⭐⭐⭐⭐', text: 'Very helpful, though we ran a little short on time.' },
];

export const M_BOOKINGS = [
  { initial: 'A', name: 'Aditya', when: 'Today 6:30 PM', q: 'CSE at a lower IIT vs ECE at a top one?', actions: [{ label: 'Join', cls: 'pri', go: 'mSession' }] },
  { initial: 'R', name: 'Riya', when: 'Tomorrow 5:00 PM', q: 'Is the CSE coding culture beginner-friendly?', actions: [{ label: 'View', cls: 'sec', act: 'toast', msg: 'Booking details' }] },
  { initial: 'D', name: 'Dev', when: 'Jul 6 · Completed', q: 'Hostel life and mess food?', actions: [{ label: 'Completed', cls: 'ghost', act: 'toast', msg: 'Session completed' }] },
];

export const VERIFY_QUEUE = [
  { initials: 'NK', name: 'Nikhil Kumar', college: 'NIT Warangal', year: 2, email: 'nk21@nitw.ac.in', color: '#b2622d' },
  { initials: 'SM', name: 'Sara Mehta', college: 'IIT Kanpur', year: 3, email: 'saram@iitk.ac.in', color: '#728157' },
  { initials: 'VJ', name: 'Vikram Joshi', college: 'IIIT Hyderabad', year: 2, email: 'vikram@iiit.ac.in', color: '#8c491a' },
];

export const FUNNEL = [
  { label: 'Visited site', n: '128,400', w: '100%' },
  { label: 'Ran predictor', n: '71,200', w: '55%' },
  { label: 'Built a choice list', n: '38,600', w: '30%' },
  { label: 'Started a booking', n: '12,100', w: '9%' },
  { label: 'Paid', n: '9,480', w: '7%' },
];

export const FAQS = [
  { q: 'How accurate is the predictor?', a: 'It uses official JoSAA opening & closing ranks from the last several years. It’s an estimate — always verify on josaa.nic.in.' },
  { q: 'What do I get for ₹100?', a: 'A 25-minute 1:1 video call with a verified current student of the college you’re considering.' },
  { q: 'Are mentors really verified?', a: 'Yes — every mentor verifies a .ac.in college email and uploads a student ID, reviewed manually before approval.' },
  { q: 'Can I get a refund?', a: 'Full refund if the mentor no-shows or you cancel 4+ hours before the session.' },
];

export const NOTIFS = [
  { icon: '⏰', title: 'Round 2 closes in 3 days', body: 'Finish your choice list before Jul 16, 5 PM.', time: '2h', unread: true },
  { icon: '📅', title: 'Session confirmed', body: 'Aarav Sharma · Today 6:30 PM.', time: '5h', unread: true },
  { icon: '💬', title: 'Aarav replied to your note', body: '"Looking forward — bring your shortlist!"', time: '6h', unread: false },
  { icon: '🎉', title: 'New: IIIT cutoffs added', body: '2025 closing ranks are now live in the predictor.', time: '1d', unread: false },
];

export const TXNS = [
  { date: 'Jul 8', item: 'Session · Aarav Sharma', amt: 100, status: 'Paid', tone: 'accent-2' },
  { date: 'Jul 2', item: 'Session · Priya Menon', amt: 100, status: 'Refunded', tone: 'neutral' },
  { date: 'Jun 28', item: 'Session · Rohan Gupta', amt: 100, status: 'Paid', tone: 'accent-2' },
];

export const ROUNDS = [
  { title: 'Round 1', date: 'Jul 8', status: 'Done', desc: 'Seat allotment complete', dot: '#728157', tone: 'accent-2' },
  { title: 'Round 2', date: 'Closes Jul 16', status: 'Active', desc: 'Choice filling open — build your list now', dot: '#c67139', tone: 'accent' },
  { title: 'Round 3', date: 'Jul 22', status: 'Upcoming', desc: 'Seat allotment', dot: '#c0b6a5', tone: 'neutral' },
  { title: 'Round 4 (final)', date: 'Jul 29', status: 'Upcoming', desc: 'Last chance to lock a seat', dot: '#c0b6a5', tone: 'neutral' },
];

export const SETTING_GROUPS = [
  { title: 'Account', rows: [{ label: 'Profile & rank', go: 'profile', val: '' }, { label: 'Email & phone', act: 'toast', msg: 'Account settings', val: 'Verified' }] },
  { title: 'Preferences', rows: [{ label: 'Notification preferences', act: 'toast', msg: 'Notification prefs', val: 'On' }, { label: 'Language', act: 'toast', msg: 'Language', val: 'English' }] },
  { title: 'Payments', rows: [{ label: 'Payment history', go: 'receipts', val: '' }] },
  { title: 'Privacy', rows: [{ label: 'Privacy & data', act: 'toast', msg: 'Privacy', val: '' }, { label: 'Legal', go: 'legal', val: '' }] },
];

export const SLOT_LIST = ['5:30 PM', '6:30 PM', '7:15 PM', '8:00 PM'];
export const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const SESSION_MAP = {
  upcoming: {
    line: 'Today · 6:30 PM · 25 min',
    actions: [
      { label: 'Join', cls: 'pri', go: 'sessionRoom' },
      { label: 'Reschedule', cls: 'sec', act: 'toast', msg: 'Reschedule' },
      { label: 'Cancel', cls: 'ghost', act: 'confirm', dialog: 'cancelSession' },
    ],
  },
  past: {
    line: 'Jul 6 · Completed · 25 min',
    actions: [
      { label: 'Rate', cls: 'pri', go: 'rateSession' },
      { label: 'Book again', cls: 'sec', go: 'marketplace' },
    ],
  },
  cancelled: {
    line: 'Jul 2 · Cancelled · refunded',
    actions: [{ label: 'Book again', cls: 'pri', go: 'marketplace' }],
  },
};

export const DIALOGS = {
  resetSent: { icon: '📧', title: 'Check your inbox', body: 'We sent a password-reset link. It expires in 30 minutes.', cancel: 'Close', confirm: 'Back to log in', go: 'login' },
  cancelSession: { icon: '⚠️', title: 'Cancel this session?', body: 'You can cancel free up to 4 hours before. This cannot be undone.', cancel: 'Keep it', confirm: 'Cancel session', go: 'sessions' },
  deleteList: { icon: '🗑️', title: 'Delete this list?', body: 'Your saved choice list will be permanently removed.', cancel: 'Keep it', confirm: 'Delete', go: 'choiceBuilder' },
  payout: { icon: '₹', title: 'Withdraw ₹1,200?', body: 'This will be sent to your UPI (aarav@okhdfc) within 24 hours.', cancel: 'Cancel', confirm: 'Withdraw', go: 'mEarnings' },
};

// Gallery groups — the "All screens" index.
export const GALLERY_GROUPS = [
  {
    title: 'Authentication & Onboarding',
    items: [['signup', 'Sign Up', ''], ['login', 'Log In', ''], ['otp', 'OTP Verify', ''], ['reset', 'Reset Password', ''], ['roleSelect', 'Role Selection', ''], ['onboarding', 'Student Onboarding', 'FLOW'], ['mentorOnboarding', 'Mentor Application', 'FLOW'], ['verifyStatus', 'Verification Status', '']],
  },
  {
    title: 'Student App',
    items: [['dashboard', 'Dashboard', ''], ['profile', 'Profile & Rank', ''], ['predictor', 'College Predictor', 'CORE'], ['filters', 'Advanced Filters', ''], ['collegeDetail', 'College Analysis', 'CORE'], ['compare', 'Comparison', ''], ['shortlist', 'Shortlist', ''], ['choiceBuilder', 'Choice-List Builder', 'CORE'], ['choiceExport', 'Export / Print', ''], ['marketplace', 'Browse Counsellors', ''], ['aiCounsellor', 'AI Counsellor', 'SOON'], ['mentorProfile', 'Mentor Profile', ''], ['booking', 'Booking', ''], ['payment', 'Payment', ''], ['bookingConfirm', 'Booking Confirmed', ''], ['sessions', 'My Sessions', ''], ['sessionRoom', 'Session Room', 'CORE'], ['rateSession', 'Rate & Review', ''], ['timeline', 'Counselling Timeline', ''], ['notifications', 'Notifications', ''], ['help', 'Help / Support', ''], ['settings', 'Settings', ''], ['receipts', 'Payment History', '']],
  },
  {
    title: 'Counsellor / Mentor App',
    items: [['mDashboard', 'Mentor Dashboard', ''], ['mProfile', 'Profile Editor', ''], ['mAvailability', 'Availability', ''], ['mVerification', 'Verification Center', ''], ['mBookings', 'Session Requests', ''], ['mSession', 'Session Room', 'CORE'], ['mEarnings', 'Earnings & Payouts', ''], ['mReviews', 'Reviews', ''], ['mNotifications', 'Notifications', ''], ['mSettings', 'Settings', '']],
  },
  {
    title: 'Super Admin',
    items: [['aDashboard', 'Admin Dashboard', ''], ['aStudents', 'Student Mgmt', ''], ['aMentors', 'Mentor Mgmt', ''], ['aVerifyQueue', 'Verification Queue', 'CRIT'], ['aCollegeData', 'College & Cutoff Data', 'CRIT'], ['aContent', 'College Content', ''], ['aSessions', 'Sessions Monitor', ''], ['aPayments', 'Payments & Payouts', ''], ['aModeration', 'Trust & Safety', ''], ['aSupport', 'Support Tickets', ''], ['aCms', 'Content / CMS', ''], ['aBroadcast', 'Broadcast', ''], ['aAnalytics', 'Analytics', ''], ['aSettings', 'Platform Config', '']],
  },
  {
    title: 'Public & Marketing',
    items: [['landing', 'Landing / Home', ''], ['howItWorks', 'How It Works', ''], ['features', 'Features', ''], ['becomeMentor', 'Become a Mentor', ''], ['pricing', 'Pricing', ''], ['guides', 'Guides / Blog', ''], ['about', 'About / Team', ''], ['faq', 'FAQ', ''], ['contact', 'Contact', ''], ['legal', 'Legal Pages', '']],
  },
  {
    title: 'Shared & System',
    items: [['emptyStates', 'Empty States', ''], ['loading', 'Loading / Skeleton', ''], ['errorPages', 'Error Pages', ''], ['confirmations', 'Confirmations', ''], ['coachMarks', 'Coach Marks', ''], ['navPatterns', 'Navigation Patterns', '']],
  },
];

// Sidebar nav definitions (mentor + admin).
export const ADMIN_LINKS = [
  ['aDashboard', 'Dashboard', '▦'], ['aStudents', 'Users', '👥'], ['aMentors', 'Mentors', '🎓'], ['aVerifyQueue', 'Verification', '✔'], ['aCollegeData', 'College Data', '🏛'], ['aContent', 'Content', '📝'], ['aSessions', 'Sessions', '🎥'], ['aPayments', 'Payments', '₹'], ['aModeration', 'Moderation', '🛡'], ['aSupport', 'Support', '💬'], ['aCms', 'CMS', '📰'], ['aBroadcast', 'Broadcast', '📣'], ['aAnalytics', 'Analytics', '📈'], ['aSettings', 'Settings', '⚙'],
];
export const MENTOR_LINKS = [
  ['mDashboard', 'Dashboard', '▦'], ['mBookings', 'Bookings', '📅'], ['mAvailability', 'Availability', '🕑'], ['mEarnings', 'Earnings', '₹'], ['mReviews', 'Reviews', '⭐'], ['mProfile', 'Profile', '👤'], ['mVerification', 'Verification', '✔'], ['mNotifications', 'Notifications', '🔔'], ['mSettings', 'Settings', '⚙'],
];
export const BOTTOM_NAV = [
  ['dashboard', 'Home', '🏠'], ['predictor', 'Predict', '🎯'], ['choiceBuilder', 'My List', '📋'], ['marketplace', 'Talk', '💬'], ['profile', 'Profile', '👤'],
];
