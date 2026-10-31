export type UserRole = 'student' | 'tutor' | 'admin';
export type AccountStatus = 'active' | 'suspended';
export type StudentModality = 'virtual' | 'in_person' | 'both';
export type TeachingModality = 'virtual' | 'at_tutor' | 'at_student';
export type TutorVerificationStatus = 'pending' | 'verified' | 'rejected';



export interface ICoordinates {
  latitude: number;
  longitude: number;
 
}

export interface IUserLocation {
  city?: string;
  address?: string;
  coordinates?: ICoordinates;
}

export interface IStudentProfile {
  location?: IUserLocation;
  subjectPreferences: string[];
  preferredModality?: StudentModality;
}

export interface ITutorCredential {
  title: string;
  institution?: string;
  description?: string;
  evidenceUrl?: string;
  verified: boolean;
}

export interface IProfessionalExperience {
  organization: string;
  position: string;
  description?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ITutorProfile {
  reviewNote?: string;
  reviewedAt?: Date;
  travelRatePerKm?: number;
  biography: string;
  specialties: string[];
  hourlyRate: number;
  teachingModalities: TeachingModality[];
  location?: IUserLocation;
  credentials: ITutorCredential[];
  professionalExperience: IProfessionalExperience[];
  verificationStatus: TutorVerificationStatus;
}

export interface IUser {
  personal?: IPersonalDetails;
  suspension?: { reason: string; suspendedAt: Date; suspendedBy: string; caseId: string };
  fullName: string;
  email: string;
  googleId?: string;
  profileImageUrl?: string;
  role?: UserRole;
  accountStatus: AccountStatus;
  studentProfile?: IStudentProfile;
  tutorProfile?: ITutorProfile;
  bookingRevision?: number;
  bookings?: Array<Record<string, unknown>>;
  createdAt?: Date;
  updatedAt?: Date;
  onboardingCompleted: boolean
}

export interface IPersonalDetails {
  phone: string;
  gender: 'female' | 'male' | 'other' | 'prefer_not_to_say';
  documentType: 'dpi' | 'passport' | 'other';
  documentNumber: string;
  categoryAffinity: string[];
}
