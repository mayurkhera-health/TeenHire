/* The V1 domain. Small on purpose: fields that drive searching, eligibility,
   matching, reporting or security are real fields; everything else stays
   loose rather than being spread across tables nobody queries. */

export type OpportunityType = 'paid' | 'internship' | 'volunteer';

/* Timing is an attribute, never an opportunity type. There is no such thing
   as a "Summer Job" here — there is a paid job tagged Summer. */
export type Timing =
  | 'after_school'
  | 'weekends'
  | 'summer'
  | 'winter_break'
  | 'spring_break'
  | 'seasonal'
  | 'year_round'
  | 'flexible';

export type Experience = 'none' | 'some' | 'required';

export type MinimumAge = 15 | 16 | 17 | 18;

export type Transportation = 'walk' | 'bike' | 'transit' | 'ride' | 'drive';

export type Interest =
  | 'sports'
  | 'food'
  | 'technology'
  | 'animals'
  | 'healthcare'
  | 'kids'
  | 'retail'
  | 'outdoors'
  | 'business'
  | 'arts'
  | 'community'
  | 'education';

export type OrganizationKind = 'business' | 'nonprofit';

/* Verification is a lifecycle, not a flag: an organization can be rejected or
   suspended after approval, and a student must never see either. */
export type VerificationStatus =
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'SUSPENDED';

export type OpportunityStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'PUBLISHED'
  | 'PAUSED'
  | 'FILLED'
  | 'EXPIRED'
  | 'REJECTED';

export type ApplicationStatus =
  | 'INTERESTED'
  | 'VIEWED'
  | 'EMPLOYER_INTERESTED'
  | 'NOT_SELECTED'
  | 'WITHDRAWN'
  | 'HIRED';

export type HoursBucket = 'under_10' | '10_20' | '20_plus' | 'varies';

export type VolunteerCommitment = 'one_time' | 'weekly' | 'monthly' | 'flexible';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface Location extends GeoPoint {
  city: string;
  zip: string;
}

export interface Organization {
  id: string;
  name: string;
  kind: OrganizationKind;
  /* A gate, not a decoration: nothing reaches a student without it, and a
     volunteer posting from a business needs an admin override on top. */
  verificationStatus: VerificationStatus;
  website?: string;
  phone?: string;
  about: string;
  location: Location;
}

export function isVerified(organization: Organization): boolean {
  return organization.verificationStatus === 'VERIFIED';
}

/* One shape per type so a paid job can never be published without pay and a
   volunteer posting can never quietly carry an hourly rate. */
export type Compensation =
  | { kind: 'hourly'; min: number; max?: number }
  | { kind: 'stipend'; amount: number; per: 'week' | 'month' | 'total' }
  | { kind: 'unpaid' }
  | { kind: 'commitment'; commitment: VolunteerCommitment };

export interface Opportunity {
  id: string;
  organizationId: string;
  title: string;
  type: OpportunityType;
  status: OpportunityStatus;
  /* A real field, because it drives eligibility. */
  minimumAge: MinimumAge;
  experience: Experience;
  timing: Timing[];
  hours?: HoursBucket;
  compensation: Compensation;
  summary: string;
  /* One line of reassurance on the card. Not a job description. */
  reassurance: string;
  responsibilities: string[];
  schedule: string;
  goodToKnow: string[];
  interests: Interest[];
  publishedAt: string;
  photo?: string;
}

export interface StudentProfile {
  name: string;
  age: number;
  searchLocation: Location;
  /* Kept apart from anything an organization can see. */
  radiusMiles: number;
  types: OpportunityType[];
  availability: Timing[];
  interests: Interest[];
  transportation: Transportation[];
  /* Plain-language things, never a skills matrix. */
  skills: string[];
  thingsDone: string[];
  hasSimilarExperience?: boolean;
}

export interface Application {
  opportunityId: string;
  status: ApplicationStatus;
  note?: string;
  createdAt: string;
  /* §34. Present only once an organization has said it wants to talk. The
     student receives the employer's details and decides whether to use them;
     nothing about the student travels the other way. */
  employer?: EmployerContact | null;
}

export interface EmployerContact {
  organizationName: string;
  contactName: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  city: string;
}

export interface NotificationPreferences {
  types: OpportunityType[];
  frequency: 'immediately' | 'daily' | 'weekly' | 'off';
}

/* What an organization sees about an interested student — and only after
   the student has expressed interest. No address, no date of birth. */
export interface InterestedStudent {
  id: string;
  firstName: string;
  age: number;
  city: string;
  distanceMiles: number;
  availability: Timing[];
  interests: Interest[];
  experience: 'First job' | 'Some experience';
  /* Plain things a teenager has actually done. Never called experience. */
  thingsDone: string[];
  note?: string;
  decision?: 'interested' | 'not_a_match';
}
