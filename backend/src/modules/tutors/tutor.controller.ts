import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { TutoringService } from '../services/service.model.js';
import { Review } from '../services/review.model.js';
import { tutorRating } from '../services/review.routes.js';
import { distanceKm, serviceSearchFilter } from './search.helpers.js';
import { User } from '../users/user.model.js';
import type { IUser, ITutorProfile } from '../users/user.types.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_CATEGORY_LENGTH = 80;

type TutorQuery = {
  page: number;
  limit: number;
  category?: string;
  minRate?: number;
  maxRate?: number;
  modality?: 'virtual' | 'in_person' | 'at_tutor' | 'at_student';
  location?: string;
};

function readPositiveInteger(value: unknown, fallback: number, maximum?: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || (maximum !== undefined && parsed > maximum)) return null;
  return parsed;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readRate(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed <= 1_000_000 ? parsed : null;
}

export function parseTutorQuery(request: Request, response: Response): TutorQuery | null {
  const page = readPositiveInteger(request.query.page, DEFAULT_PAGE);
  const limit = readPositiveInteger(request.query.limit, DEFAULT_LIMIT, MAX_LIMIT);

  if (page === null || limit === null) {
    response.status(400).json({ error: 'page and limit must be positive integers; limit cannot exceed 50.' });
    return null;
  }

  const rawCategory = request.query.category;
  if (rawCategory !== undefined && typeof rawCategory !== 'string') {
    response.status(400).json({ error: 'category must be a single text value.' });
    return null;
  }

  const category = typeof rawCategory === 'string' ? rawCategory.trim() : undefined;
  if (category && category.length > MAX_CATEGORY_LENGTH) {
    response.status(400).json({ error: `category cannot exceed ${MAX_CATEGORY_LENGTH} characters.` });
    return null;
  }

  const minRate = readRate(request.query.minRate);
  const maxRate = readRate(request.query.maxRate);
  if (minRate === null || maxRate === null || (minRate !== undefined && maxRate !== undefined && minRate > maxRate)) {
    response.status(400).json({ error: 'minRate and maxRate must be valid non-negative amounts with minRate no greater than maxRate.' });
    return null;
  }

  const rawModality = request.query.modality;
  if (rawModality !== undefined && !['virtual', 'in_person', 'at_student', 'at_tutor'].includes(rawModality as string)) {
    response.status(400).json({ error: 'modality must be virtual or in_person.' });
    return null;
  }

  const rawLocation = request.query.location;
  if (rawLocation !== undefined && typeof rawLocation !== 'string') {
    response.status(400).json({ error: 'location must be a single text value.' });
    return null;
  }
  const location = typeof rawLocation === 'string' ? rawLocation.trim() : undefined;
  if (location && location.length > 100) {
    response.status(400).json({ error: 'location cannot exceed 100 characters.' });
    return null;
  }

  return {
    page,
    limit,
    ...(category ? { category } : {}),
    ...(minRate !== undefined ? { minRate } : {}),
    ...(maxRate !== undefined ? { maxRate } : {}),
    ...(rawModality ? { modality: rawModality as TutorQuery['modality'] } : {}),
    ...(location ? { location } : {}),
  };
}

export function buildTutorFilter(query: TutorQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    role: 'tutor',
    accountStatus: 'active',
    tutorProfile: { $exists: true },
  };
  if (query.category) filter['tutorProfile.specialties'] = { $regex: escapeRegex(query.category), $options: 'i' };
  if (query.minRate !== undefined || query.maxRate !== undefined) {
    filter['tutorProfile.hourlyRate'] = {
      ...(query.minRate !== undefined ? { $gte: query.minRate } : {}),
      ...(query.maxRate !== undefined ? { $lte: query.maxRate } : {}),
    };
  }
  if (query.modality) {
    filter['tutorProfile.teachingModalities'] = { $in: query.modality === 'in_person' ? ['at_tutor', 'at_student'] : [query.modality] };
  }
  if (query.location) filter['tutorProfile.location.city'] = { $regex: escapeRegex(query.location), $options: 'i' };
  return filter;
}

export function toPublicTutor(user: Partial<IUser> & { _id: unknown }) {
  const profile = user.tutorProfile as ITutorProfile | undefined;

  return {
    id: String(user._id),
    fullName: user.fullName,
    profileImageUrl: user.profileImageUrl,
    tutorProfile: {
      biography: profile?.biography,
      specialties: profile?.specialties ?? [],
      hourlyRate: profile?.hourlyRate,
      teachingModalities: profile?.teachingModalities ?? [],
      // Only the city is public; a street address and precise coordinates stay private.
      location: profile?.location?.city ? { city: profile.location.city } : undefined,
      credentials: (profile?.credentials ?? []).map(({ title, institution, description, verified }) => ({
        title,
        institution,
        description,
        verified,
      })),
      professionalExperience: profile?.professionalExperience ?? [],
      verificationStatus: profile?.verificationStatus ?? 'pending',
    },
    createdAt: user.createdAt,
  };
}

export async function listPublicTutors(request: Request, response: Response): Promise<void> {
  const query = parseTutorQuery(request, response);
  if (!query) return;

  const numberParam = (key: string, min: number, max: number) => {
    const raw = request.query[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== 'string' || raw.trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max) return null;
    return Number(raw);
  };
  const latitude = numberParam('latitude', -90, 90);
  const longitude = numberParam('longitude', -180, 180);
  const maxDistance = numberParam('maxDistance', 0.1, 20000);
  const minRating = numberParam('minRating', 0, 5);
  if ([latitude, longitude, maxDistance, minRating].includes(null) || ((latitude === undefined) !== (longitude === undefined)) || (maxDistance !== undefined && latitude === undefined)) {
    response.status(400).json({ error: 'Revisa las coordenadas, distancia y calificación.' }); return;
  }

  const skip = (query.page - 1) * query.limit;
  const publicFields = [
    '_id',
    'fullName',
    'profileImageUrl',
    'tutorProfile.biography',
    'tutorProfile.specialties',
    'tutorProfile.hourlyRate',
    'tutorProfile.teachingModalities',
    'tutorProfile.location.city',
    'tutorProfile.credentials.title',
    'tutorProfile.credentials.institution',
    'tutorProfile.credentials.description',
    'tutorProfile.credentials.verified',
    'tutorProfile.professionalExperience',
    'tutorProfile.verificationStatus',
    'createdAt',
  ].join(' ');

  try {
    const [allServices, matchingServices, ratings] = await Promise.all([
      TutoringService.distinct('tutorId'),
      TutoringService.find(serviceSearchFilter(query)).select('tutorId hourlyRate modality category').lean(),
      Review.aggregate<{ _id: mongoose.Types.ObjectId; average: number; count: number }>([{ $group: { _id: '$tutorId', average: { $avg: '$rating' }, count: { $sum: 1 } } }]),
    ]);
    const legacyFilter = buildTutorFilter(query);
    if (query.modality === 'at_student' || query.modality === 'at_tutor') legacyFilter['tutorProfile.teachingModalities'] = query.modality;
    const filter = {
      role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified', tutorProfile: { $exists: true },
      ...(query.location ? { 'tutorProfile.location.city': { $regex: escapeRegex(query.location), $options: 'i' } } : {}),
      $or: [
        { _id: { $in: matchingServices.map((service) => service.tutorId) } },
        { ...legacyFilter, _id: { $nin: allServices } },
      ],
    };
    const users = await User.find(filter).select(`${publicFields} tutorProfile.location.coordinates`).sort({ createdAt: -1, _id: 1 }).lean();
    const ratingMap = new Map(ratings.map((rating) => [String(rating._id), rating]));
    let results = users.map((user) => {
      const id = String(user._id);
      const courses = matchingServices.filter((service) => String(service.tutorId) === id);
      const rating = ratingMap.get(id);
      const coords = user.tutorProfile?.location?.coordinates;
      const distance = latitude !== undefined && latitude !== null && longitude !== undefined && longitude !== null && coords ? distanceKm({ latitude, longitude }, coords) : null;
      const publicTutor = toPublicTutor(user);
      if (courses.length) {
        publicTutor.tutorProfile.hourlyRate = Math.min(...courses.map((course) => course.hourlyRate));
        publicTutor.tutorProfile.teachingModalities = [...new Set(courses.map((course) => course.modality))];
      }
      return { ...publicTutor, distanceKm: distance, averageRating: rating?.average ?? null, reviewCount: rating?.count ?? 0, matchingCourseCount: courses.length };
    }).filter((item) => (maxDistance === undefined || (item.distanceKm !== null && item.distanceKm <= maxDistance!)) && (minRating === undefined || (item.averageRating !== null && item.averageRating >= minRating!)));
    if (latitude !== undefined) results.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    const total = results.length;

    response.status(200).json({
      data: results.slice(skip, skip + query.limit),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Could not list public tutors (${errorType}).`);
    response.status(500).json({ error: 'Tutors could not be retrieved right now.' });
  }
}

export async function getPublicTutor(request: Request, response: Response): Promise<void> {
  const tutorId = request.params.id;
  if (typeof tutorId !== 'string' || !mongoose.Types.ObjectId.isValid(tutorId)) {
    response.status(400).json({ error: 'Tutor id is invalid.' });
    return;
  }
  const publicFields = [
    '_id', 'fullName', 'profileImageUrl', 'tutorProfile.biography', 'tutorProfile.specialties',
    'tutorProfile.hourlyRate', 'tutorProfile.teachingModalities', 'tutorProfile.location.city',
    'tutorProfile.credentials.title', 'tutorProfile.credentials.institution', 'tutorProfile.credentials.description',
    'tutorProfile.credentials.verified', 'tutorProfile.professionalExperience', 'tutorProfile.verificationStatus', 'createdAt',
  ].join(' ');
  try {
    const user = await User.findOne({ _id: tutorId, role: 'tutor', accountStatus: 'active', 'tutorProfile.verificationStatus': 'verified', tutorProfile: { $exists: true } })
      .select(publicFields).lean().exec();
    if (!user) { response.status(404).json({ error: 'Tutor not found.' }); return; }
    response.status(200).json({ data: { ...toPublicTutor(user as unknown as Partial<IUser> & { _id: unknown }), ...await tutorRating(user._id) } });
  } catch (error) {
    const errorType = error instanceof Error ? error.name : 'UnknownError';
    console.error(`Could not retrieve public tutor (${errorType}).`);
    response.status(500).json({ error: 'Tutor profile could not be retrieved right now.' });
  }
}
