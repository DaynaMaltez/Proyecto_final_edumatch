import mongoose, { Schema, type Model } from 'mongoose';
import type {
  ICoordinates,
  IProfessionalExperience,
  IStudentProfile,
  ITutorCredential,
  ITutorProfile,
  IUser,
  IUserLocation,
} from './user.types.js';

function isHttpsUrl(value?: string): boolean {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const coordinatesSchema = new Schema<ICoordinates>(
  {
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const locationSchema = new Schema<IUserLocation>(
  {
    city: { type: String, trim: true, maxlength: 100 },
    address: { type: String, trim: true, maxlength: 300 },
    coordinates: { type: coordinatesSchema, default: undefined },
  },
  { _id: false },
);

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    location: { type: locationSchema, default: undefined },
    subjectPreferences: {
      type: [{ type: String, trim: true, maxlength: 80 }],
      default: [],
      validate: {
        validator: (subjects: string[]) => subjects.length <= 30,
        message: 'A student may have at most 30 subject preferences.',
      },
    },
    preferredModality: {
      type: String,
      enum: ['virtual', 'in_person', 'both'],
    },
  },
  { _id: false },
);

const tutorCredentialSchema = new Schema<ITutorCredential>(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    institution: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    evidenceUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      validate: { validator: isHttpsUrl, message: 'Evidence URLs must use HTTPS.' },
    },
    // Credentials are never considered verified unless explicitly reviewed.
    verified: { type: Boolean, default: false },
  },
  { _id: false },
);

const professionalExperienceSchema = new Schema<IProfessionalExperience>(
  {
    organization: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    position: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    startDate: { type: Date },
    endDate: {
      type: Date,
      validate: {
        validator(this: IProfessionalExperience, endDate?: Date) {
          return !endDate || !this.startDate || endDate >= this.startDate;
        },
        message: 'The end date cannot be earlier than the start date.',
      },
    },
  },
  { _id: false },
);

const tutorProfileSchema = new Schema<ITutorProfile>(
  {
    biography: { type: String, required: true, trim: true, minlength: 20, maxlength: 2000 },
    specialties: {
      type: [{ type: String, trim: true, minlength: 2, maxlength: 80 }],
      required: true,
      default: [],
      validate: {
        validator: (specialties: string[]) => specialties.length >= 1 && specialties.length <= 30,
        message: 'A tutor must have between one and 30 specialties.',
      },
    },
    hourlyRate: { type: Number, required: true, min: 0, max: 1_000_000 },
    travelRatePerKm: { type: Number, min: 0, max: 10000 },
    reviewNote: { type: String, maxlength: 1000 },
    reviewedAt: Date,
    teachingModalities: {
      type: [{ type: String, enum: ['virtual', 'at_tutor', 'at_student'] }],
      required: true,
      validate: {
        validator: (modalities: string[]) => modalities.length > 0 && modalities.length <= 3,
        message: 'Select between one and three teaching modalities.',
      },
    },
    location: { type: locationSchema, default: undefined },
    credentials: {
      type: [tutorCredentialSchema],
      default: [],
      validate: {
        validator: (credentials: ITutorCredential[]) => credentials.length <= 30,
        message: 'A tutor may have at most 30 credentials.',
      },
    },
    professionalExperience: {
      type: [professionalExperienceSchema],
      default: [],
      validate: {
        validator: (experiences: IProfessionalExperience[]) => experiences.length <= 30,
        message: 'A tutor may have at most 30 professional experience entries.',
      },
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
      required: true,
    },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email address.'],
      unique: true,
    },
    googleId: { type: String, trim: true, minlength: 1, maxlength: 255, sparse: true, unique: true },
    profileImageUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      validate: { validator: isHttpsUrl, message: 'Profile image URLs must use HTTPS.' },
    },
    role: { type: String, enum: ['student', 'tutor', 'admin'], required: function () { return this.onboardingCompleted; } },
    onboardingCompleted: { type: Boolean, default: false, required: true },
    personal: { type: new Schema({
      phone: { type: String, required: true, match: /^\+?[0-9]{8,15}$/ },
      gender: { type: String, required: true, enum: ['female', 'male', 'other', 'prefer_not_to_say'] },
      documentType: { type: String, required: true, enum: ['dpi', 'passport', 'other'] },
      documentNumber: { type: String, required: true, minlength: 5, maxlength: 40 },
      categoryAffinity: { type: [String], required: true, validate: (values: string[]) => values.length >= 1 && values.length <= 30 },
    }, { _id: false, strict: 'throw' }), default: undefined },
    accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active', required: true },
    suspension: { type: new Schema({ reason: { type: String, required: true, maxlength: 2000 }, suspendedAt: { type: Date, required: true }, suspendedBy: { type: String, required: true }, caseId: { type: String, required: true } }, { _id: false }), default: undefined },
    studentProfile: { type: studentProfileSchema, default: undefined },
    tutorProfile: { type: tutorProfileSchema, default: undefined },
    // Scheduling coordination marker: atomically advanced before accepting each booking.
    bookingRevision: { type: Number, default: 0 },
    bookings: { type: [Schema.Types.Mixed], default: [] },
  },
  {
    collection: 'usuarios',
    timestamps: true,
    strict: 'throw',
    optimisticConcurrency: true,
  },
);

export const User = (mongoose.models.User as Model<IUser> | undefined)
  ?? mongoose.model<IUser>('User', userSchema, 'usuarios');
