// The college-branch dataset. Same rows as the frontend's dummy data, so the
// backend predictor produces IDENTICAL results — now sourced from DynamoDB.
// [name, type, city, state, nirf, estd, branch, exam, close, fees(L), avg(LPA), high(Cr), rate]

export type CollegeType = 'IIT' | 'NIT' | 'IIIT' | 'GFTI';
export type Exam = 'adv' | 'main'; // which rank the closing rank is measured against

/** A single college+branch offering, with its (single, latest) closing rank. */
export interface Offering {
  id: number;
  college: string;
  type: CollegeType;
  city: string;
  state: string;
  nirf: number; // 0 = unranked
  estd: number;
  branch: string;
  exam: Exam;
  close: number; // closing rank (Open category, latest round)
  fees: number; // total, in ₹ lakh
  avg: number; // average package, ₹ LPA
  high: number; // highest package, ₹ Cr
  rate: string; // placement rate
}

const RAW: [string, CollegeType, string, string, number, number, string, Exam, number, number, number, number, string][] = [
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

export const OFFERINGS: Offering[] = RAW.map((r, i) => ({
  id: i + 1, college: r[0], type: r[1], city: r[2], state: r[3], nirf: r[4], estd: r[5],
  branch: r[6], exam: r[7], close: r[8], fees: r[9], avg: r[10], high: r[11], rate: r[12],
}));

/** The dataset version we seed. Real product bumps this per JoSAA round. */
export const DATASET_VERSION = '2025.1';
