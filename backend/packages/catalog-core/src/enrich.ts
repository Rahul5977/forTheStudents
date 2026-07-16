// Institute enrichment — city, state, NIRF (2024, where known), and approx total
// B.Tech fees. Curated for the institutes students actually target (all IITs + NITs
// + major IIITs); a heuristic fills state/city for the long tail from the name.
//
// NOTE: NIRF/fees are best-effort (NIRF where officially ranked; fees are approximate
// ranges by type). State drives the Home-State quota, so it's curated for NITs.
import type { CollegeType } from './types';

export interface Enrichment { short: string; city: string; state: string; nirf: number | null; feesLakh: number }

// Curated: matched by a unique signature substring of the official name.
// [signature, short, city, state, nirf(null=unranked), feesLakh]
const CURATED: [string, string, string, string, number | null, number][] = [
  // ── IITs (NIRF 2024 engineering) ──
  ['Technology Madras', 'IIT Madras', 'Chennai', 'Tamil Nadu', 1, 8.6],
  ['Technology Delhi', 'IIT Delhi', 'New Delhi', 'Delhi', 2, 9.1],
  ['Technology Bombay', 'IIT Bombay', 'Mumbai', 'Maharashtra', 3, 9.2],
  ['Technology Kanpur', 'IIT Kanpur', 'Kanpur', 'Uttar Pradesh', 4, 8.6],
  ['Technology Kharagpur', 'IIT Kharagpur', 'Kharagpur', 'West Bengal', 5, 8.4],
  ['Technology Roorkee', 'IIT Roorkee', 'Roorkee', 'Uttarakhand', 6, 8.9],
  ['Technology Guwahati', 'IIT Guwahati', 'Guwahati', 'Assam', 7, 8.7],
  ['Technology Hyderabad', 'IIT Hyderabad', 'Hyderabad', 'Telangana', 8, 8.6],
  ['(BHU) Varanasi', 'IIT (BHU) Varanasi', 'Varanasi', 'Uttar Pradesh', 15, 9.5],
  ['(ISM) Dhanbad', 'IIT (ISM) Dhanbad', 'Dhanbad', 'Jharkhand', 16, 9.4],
  ['Technology Indore', 'IIT Indore', 'Indore', 'Madhya Pradesh', 16, 8.2],
  ['Technology Bhubaneswar', 'IIT Bhubaneswar', 'Bhubaneswar', 'Odisha', 26, 8.9],
  ['Technology Gandhinagar', 'IIT Gandhinagar', 'Gandhinagar', 'Gujarat', 25, 9.0],
  ['Technology Ropar', 'IIT Ropar', 'Rupnagar', 'Punjab', 22, 8.8],
  ['Technology Patna', 'IIT Patna', 'Patna', 'Bihar', 29, 8.5],
  ['Technology Mandi', 'IIT Mandi', 'Mandi', 'Himachal Pradesh', 31, 9.1],
  ['Technology Jodhpur', 'IIT Jodhpur', 'Jodhpur', 'Rajasthan', 47, 8.9],
  ['Technology Tirupati', 'IIT Tirupati', 'Tirupati', 'Andhra Pradesh', 59, 8.6],
  ['Technology Palakkad', 'IIT Palakkad', 'Palakkad', 'Kerala', 64, 8.5],
  ['Technology Jammu', 'IIT Jammu', 'Jammu', 'Jammu and Kashmir', 65, 8.7],
  ['Technology Dharwad', 'IIT Dharwad', 'Dharwad', 'Karnataka', null, 8.5],
  ['Technology Bhilai', 'IIT Bhilai', 'Bhilai', 'Chhattisgarh', null, 8.4],
  ['Technology Goa', 'IIT Goa', 'Ponda', 'Goa', null, 8.6],
  // ── NITs (state drives Home-State quota) ──
  ['Technology, Tiruchirappalli', 'NIT Trichy', 'Tiruchirappalli', 'Tamil Nadu', 9, 6.2],
  ['Technology, Warangal', 'NIT Warangal', 'Warangal', 'Telangana', 21, 6.2],
  ['Technology Karnataka, Surathkal', 'NIT Surathkal', 'Mangalore', 'Karnataka', 17, 6.3],
  ['Technology, Rourkela', 'NIT Rourkela', 'Rourkela', 'Odisha', 19, 6.4],
  ['Technology Calicut', 'NIT Calicut', 'Kozhikode', 'Kerala', 23, 6.0],
  ['Malaviya National Institute of Technology Jaipur', 'MNIT Jaipur', 'Jaipur', 'Rajasthan', 46, 6.3],
  ['Maulana Azad National Institute of Technology Bhopal', 'MANIT Bhopal', 'Bhopal', 'Madhya Pradesh', 65, 6.0],
  ['Motilal Nehru National Institute of Technology Allahabad', 'MNNIT Allahabad', 'Prayagraj', 'Uttar Pradesh', 49, 6.1],
  ['Sardar Vallabhbhai National Institute of Technology, Surat', 'SVNIT Surat', 'Surat', 'Gujarat', 66, 6.2],
  ['Visvesvaraya National Institute of Technology, Nagpur', 'VNIT Nagpur', 'Nagpur', 'Maharashtra', 26, 6.1],
  ['Dr. B R Ambedkar National Institute of Technology, Jalandhar', 'NIT Jalandhar', 'Jalandhar', 'Punjab', 66, 6.0],
  ['Technology, Kurukshetra', 'NIT Kurukshetra', 'Kurukshetra', 'Haryana', 63, 6.1],
  ['Technology Durgapur', 'NIT Durgapur', 'Durgapur', 'West Bengal', 43, 6.0],
  ['Technology, Silchar', 'NIT Silchar', 'Silchar', 'Assam', 45, 5.9],
  ['Technology Hamirpur', 'NIT Hamirpur', 'Hamirpur', 'Himachal Pradesh', 84, 5.9],
  ['Technology, Jamshedpur', 'NIT Jamshedpur', 'Jamshedpur', 'Jharkhand', 90, 6.0],
  ['Technology Raipur', 'NIT Raipur', 'Raipur', 'Chhattisgarh', 74, 6.0],
  ['Technology Agartala', 'NIT Agartala', 'Agartala', 'Tripura', null, 5.8],
  ['Technology Delhi', 'NIT Delhi', 'New Delhi', 'Delhi', 45, 6.2],
  ['Technology Patna', 'NIT Patna', 'Patna', 'Bihar', 56, 6.0],
  ['Technology, Srinagar', 'NIT Srinagar', 'Srinagar', 'Jammu and Kashmir', null, 5.9],
  ['Technology, Uttarakhand', 'NIT Uttarakhand', 'Srinagar (Garhwal)', 'Uttarakhand', null, 5.8],
  ['Technology, Andhra Pradesh', 'NIT Andhra Pradesh', 'Tadepalligudem', 'Andhra Pradesh', null, 5.9],
  ['Technology Goa', 'NIT Goa', 'Ponda', 'Goa', null, 5.9],
  ['Technology Meghalaya', 'NIT Meghalaya', 'Shillong', 'Meghalaya', null, 5.9],
  ['Technology Nagaland', 'NIT Nagaland', 'Dimapur', 'Nagaland', null, 5.7],
  ['Technology Sikkim', 'NIT Sikkim', 'Ravangla', 'Sikkim', null, 5.7],
  ['Technology Puducherry', 'NIT Puducherry', 'Karaikal', 'Puducherry', null, 5.9],
  ['Technology, Manipur', 'NIT Manipur', 'Imphal', 'Manipur', null, 5.7],
  ['Technology, Mizoram', 'NIT Mizoram', 'Aizawl', 'Mizoram', null, 5.7],
  ['Technology Arunachal Pradesh', 'NIT Arunachal Pradesh', 'Jote', 'Arunachal Pradesh', null, 5.7],
  // ── Major IIITs ──
  ['Information Technology, Allahabad', 'IIIT Allahabad', 'Prayagraj', 'Uttar Pradesh', 84, 6.6],
  ['Atal Bihari Vajpayee Indian Institute of Information Technology & Management Gwalior', 'IIITM Gwalior', 'Gwalior', 'Madhya Pradesh', null, 5.5],
  ['Design & Manufacturing, Kancheepuram', 'IIITDM Kancheepuram', 'Chennai', 'Tamil Nadu', 74, 6.0],
  ['Design & Manufacture Jabalpur', 'IIITDM Jabalpur', 'Jabalpur', 'Madhya Pradesh', null, 5.8],
  ['Information Technology (IIIT), Sri City', 'IIIT Sri City', 'Chittoor', 'Andhra Pradesh', null, 7.6],
];

// City → state, for institutes not in the curated list (best-effort).
const CITY_STATE: Record<string, string> = {
  Silchar: 'Assam', Ranchi: 'Jharkhand', Deoghar: 'Jharkhand', Patna: 'Bihar', Nagpur: 'Maharashtra',
  Pune: 'Maharashtra', Kota: 'Rajasthan', Kalyani: 'West Bengal', Sonepat: 'Haryana', Una: 'Himachal Pradesh',
  Vadodara: 'Gujarat', Agartala: 'Tripura', Bhagalpur: 'Bihar', Bhopal: 'Madhya Pradesh', Kurnool: 'Andhra Pradesh',
  Guwahati: 'Assam', Lucknow: 'Uttar Pradesh', Surat: 'Gujarat', Tiruchirappalli: 'Tamil Nadu', Dharwad: 'Karnataka',
  Kottayam: 'Kerala', Raichur: 'Karnataka', Kokrajar: 'Assam', Bhadohi: 'Uttar Pradesh', Salem: 'Tamil Nadu',
  Bhilai: 'Chhattisgarh', Sagar: 'Madhya Pradesh', Ahmedabad: 'Gujarat', 'Naya Raipur': 'Chhattisgarh',
  Chandigarh: 'Chandigarh', Longowal: 'Punjab', Tezpur: 'Assam', Shillong: 'Meghalaya', Jabalpur: 'Madhya Pradesh',
  Puducherry: 'Puducherry', Bilaspur: 'Chhattisgarh', Katra: 'Jammu and Kashmir', Hyderabad: 'Telangana',
  Delhi: 'Delhi', Aurangabad: 'Maharashtra', Kundli: 'Haryana', Thanjavur: 'Tamil Nadu', Malda: 'West Bengal',
  Haridwar: 'Uttarakhand', Aizawl: 'Mizoram', Bhubaneswar: 'Odisha', Diu: 'Daman and Diu', Agartala2: 'Tripura',
};

const FEES_BY_TYPE: Record<CollegeType, number> = { IIT: 8.6, NIT: 6.0, IIIT: 6.0, GFTI: 4.5 };

/** Extract a probable city (last comma-token or trailing word) from a name. */
function guessCity(name: string): string {
  const afterComma = name.split(',').pop()!.trim().replace(/\(.*\)/g, '').replace(/-\s*\d+.*/, '').trim();
  const w = afterComma.split(/\s+/).slice(-1)[0] ?? '';
  return afterComma.length > 2 && afterComma.length < 24 ? afterComma : w;
}

/** The college type a curated short name implies (IIT/NIT/IIIT/GFTI). Used to reject
 *  cross-type signature collisions — e.g. "National Institute of Technology Delhi"
 *  contains the substring "Technology Delhi" and would otherwise match the IIT Delhi row. */
function shortType(short: string): CollegeType {
  if (/IIIT/.test(short)) return 'IIIT';
  if (/\bIIT\b/.test(short)) return 'IIT';
  if (/N?IT\b|NIT/.test(short)) return 'NIT'; // NIT, MNIT, VNIT, SVNIT, MANIT, MNNIT…
  return 'GFTI';
}

/** Enrich one institute. Curated first; else derive. */
export function enrich(institute: string, type: CollegeType): Enrichment {
  for (const [sig, short, city, state, nirf, fees] of CURATED) {
    // Require the curated row's implied type to match the derived type, so an
    // ambiguous signature ("Technology Delhi") can't map a NIT onto an IIT row.
    if (institute.includes(sig) && shortType(short) === type) {
      return { short, city, state, nirf, feesLakh: fees };
    }
  }
  const city = guessCity(institute);
  const state = CITY_STATE[city] ?? '';
  // Short name: collapse the common long prefixes.
  const short = institute
    .replace('Indian Institute of Information Technology', 'IIIT')
    .replace('Indian Institute of Technology', 'IIT')
    .replace('National Institute of Technology', 'NIT')
    .replace(/\s+/g, ' ')
    .slice(0, 46)
    .trim();
  return { short, city, state, nirf: null, feesLakh: FEES_BY_TYPE[type] };
}

/** Slugify a display name into a url-safe, stable id fragment. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Canonical, name-churn-stable institute id — the join key for every content table
 * and the forecast series. Derived from the CURATED short name (which is matched by a
 * signature substring, so it survives the year-to-year churn in the official name),
 * falling back to a slug of the derived short for the long tail. Deterministic: the
 * same institute always yields the same id, regardless of minor name variations.
 *
 * NOTE(owner): the long-tail (uncurated GFTIs) keys off the derived short, so a large
 * rename across years could split one institute into two ids. TODO(owner): add an alias
 * crosswalk table for any long-tail institute whose name churns across the corpus.
 */
export function instituteId(institute: string, type: CollegeType): string {
  return slug(enrich(institute, type).short);
}
