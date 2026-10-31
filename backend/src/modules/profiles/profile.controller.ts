import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { assertRequiredOnboarding, validatePersonalDetails } from './onboarding.validation.js';
import { User } from '../users/user.model.js';
import type { IStudentProfile, ITutorProfile, IUser } from '../users/user.types.js';

type ProfileDocument = Pick<IUser, 'personal' | 'fullName' | 'email' | 'profileImageUrl' | 'role' | 'accountStatus' | 'studentProfile' | 'tutorProfile'| 'onboardingCompleted'> & {
  _id: { toString(): string } | string;
  save(): Promise<unknown>;
};

export interface ProfileControllerDependencies {
  findById(id: string): Promise<ProfileDocument | null>;
}

const defaultDependencies: ProfileControllerDependencies = {
  findById: (id) => User.findById(id).select('personal fullName email profileImageUrl role accountStatus studentProfile tutorProfile onboardingCompleted __v').exec(),
};

type ValidationResult<T> = { value: T } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

function validateLocation(value: unknown): ValidationResult<NonNullable<IStudentProfile['location']>> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['city', 'address', 'coordinates'])) return { error: 'La ubicación contiene campos inválidos.' };
  if (value.city !== undefined && !boundedString(value.city, 1, 100)) return { error: 'La ciudad debe tener entre 1 y 100 caracteres.' };
  if (value.address !== undefined && !boundedString(value.address, 1, 300)) return { error: 'La dirección debe tener entre 1 y 300 caracteres.' };
  if (value.coordinates !== undefined) {
    if (!isRecord(value.coordinates) || !hasOnlyKeys(value.coordinates, ['latitude', 'longitude'])) return { error: 'Las coordenadas no son válidas.' };
    const { latitude, longitude } = value.coordinates;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return { error: 'Las coordenadas están fuera de rango.' };
    }
  }
  return { value: value as NonNullable<IStudentProfile['location']> };
}

function validateStudentProfile(value: unknown): ValidationResult<IStudentProfile> {
  if (!isRecord(value) || !hasOnlyKeys(value, ['location', 'subjectPreferences', 'preferredModality'])) return { error: 'El perfil de estudiante contiene campos inválidos.' };
  if (!Array.isArray(value.subjectPreferences) || value.subjectPreferences.length > 30
    || !value.subjectPreferences.every((subject) => boundedString(subject, 1, 80))) {
    return { error: 'Indica hasta 30 materias de entre 1 y 80 caracteres.' };
  }
  const modalities = ['virtual', 'in_person', 'both'];
  if (value.preferredModality !== undefined && (typeof value.preferredModality !== 'string' || !modalities.includes(value.preferredModality))) {
    return { error: 'La modalidad preferida no es válida.' };
  }
  let location: IStudentProfile['location'];
  if (value.location !== undefined) {
    const result = validateLocation(value.location);
    if ('error' in result) return result;
    location = result.value;
  }
  return { value: {
    ...(location ? { location } : {}),
    subjectPreferences: value.subjectPreferences.map((subject: string) => subject.trim()),
    ...(value.preferredModality ? { preferredModality: value.preferredModality as IStudentProfile['preferredModality'] } : {}),
  } };
}

function validateTutorProfile(value: unknown, currentProfile?: ITutorProfile): ValidationResult<ITutorProfile> {
  const keys = ['biography', 'specialties', 'hourlyRate', 'travelRatePerKm', 'teachingModalities', 'location', 'credentials', 'professionalExperience'];
  if (!isRecord(value) || !hasOnlyKeys(value, keys)) return { error: 'El perfil de tutor contiene campos inválidos.' };
  if (!boundedString(value.biography, 20, 2000)) return { error: 'La biografía debe tener entre 20 y 2000 caracteres.' };
  if (!Array.isArray(value.specialties) || value.specialties.length < 1 || value.specialties.length > 30
    || !value.specialties.every((item) => boundedString(item, 2, 80))) return { error: 'Indica entre 1 y 30 especialidades válidas.' };
  if (typeof value.hourlyRate !== 'number' || !Number.isFinite(value.hourlyRate) || value.hourlyRate < 0 || value.hourlyRate > 1_000_000) {
    return { error: 'La tarifa por hora debe ser un número válido entre 0 y 1000000.' };
  }
  const modalities = ['virtual', 'at_tutor', 'at_student'];
  if (value.travelRatePerKm !== undefined && (typeof value.travelRatePerKm !== 'number' || !Number.isFinite(value.travelRatePerKm) || value.travelRatePerKm < 0 || value.travelRatePerKm > 10000)) return { error: 'La tarifa por kilómetro debe estar entre 0 y 10000.' };
  if (!Array.isArray(value.teachingModalities) || value.teachingModalities.length < 1 || value.teachingModalities.length > 3
    || !value.teachingModalities.every((item) => typeof item === 'string' && modalities.includes(item))) return { error: 'Selecciona al menos una modalidad válida.' };

  let location: ITutorProfile['location'];
  if (value.location !== undefined) {
    const result = validateLocation(value.location);
    if ('error' in result) return result;
    location = result.value;
  }

  if (!Array.isArray(value.credentials) || value.credentials.length > 30) return { error: 'Puedes registrar hasta 30 credenciales.' };
  const credentials: ITutorProfile['credentials'] = [];
  for (const credential of value.credentials) {
    if (!isRecord(credential) || !hasOnlyKeys(credential, ['title', 'institution', 'description', 'evidenceUrl'])) return { error: 'Una credencial contiene campos no permitidos.' };
    if (!boundedString(credential.title, 2, 120)
      || (credential.institution !== undefined && !boundedString(credential.institution, 1, 120))
      || (credential.description !== undefined && !boundedString(credential.description, 1, 500))) return { error: 'Los datos de una credencial no son válidos.' };
    if (credential.evidenceUrl !== undefined) {
      if (typeof credential.evidenceUrl !== 'string' || credential.evidenceUrl.length > 2048) return { error: 'La URL de evidencia no es válida.' };
      try { if (new URL(credential.evidenceUrl).protocol !== 'https:') return { error: 'Las URLs de evidencia deben usar HTTPS.' }; }
      catch { return { error: 'La URL de evidencia no es válida.' }; }
    }
    const title = credential.title.trim();
    const institution = typeof credential.institution === 'string' ? credential.institution.trim() : undefined;
    const description = typeof credential.description === 'string' ? credential.description.trim() : undefined;
    const evidenceUrl = typeof credential.evidenceUrl === 'string' ? credential.evidenceUrl.trim() : undefined;
    const previouslyReviewed = currentProfile?.credentials.find((existing) => existing.title === title
      && existing.institution === institution
      && existing.description === description
      && existing.evidenceUrl === evidenceUrl);
    credentials.push({
      title,
      ...(institution ? { institution } : {}),
      ...(description ? { description } : {}),
      ...(evidenceUrl ? { evidenceUrl } : {}),
      // Preserve review only for an exact match with an already stored credential.
      verified: previouslyReviewed?.verified ?? false,
    });
  }

  if (!Array.isArray(value.professionalExperience) || value.professionalExperience.length > 30) return { error: 'Puedes registrar hasta 30 experiencias profesionales.' };
  const professionalExperience: ITutorProfile['professionalExperience'] = [];
  for (const experience of value.professionalExperience) {
    if (!isRecord(experience) || !hasOnlyKeys(experience, ['organization', 'position', 'description', 'startDate', 'endDate'])) return { error: 'Una experiencia contiene campos no permitidos.' };
    if (!boundedString(experience.organization, 2, 120) || !boundedString(experience.position, 2, 120)
      || (experience.description !== undefined && !boundedString(experience.description, 1, 1000))) return { error: 'Los datos de una experiencia no son válidos.' };
    const startDate = experience.startDate === undefined ? undefined : new Date(String(experience.startDate));
    const endDate = experience.endDate === undefined ? undefined : new Date(String(experience.endDate));
    if ((startDate && !Number.isFinite(startDate.getTime())) || (endDate && !Number.isFinite(endDate.getTime()))
      || (startDate && endDate && endDate < startDate)) return { error: 'Las fechas de experiencia no son válidas.' };
    professionalExperience.push({
      organization: experience.organization.trim(),
      position: experience.position.trim(),
      ...(typeof experience.description === 'string' ? { description: experience.description.trim() } : {}),
      ...(startDate ? { startDate } : {}),
      ...(endDate ? { endDate } : {}),
    });
  }

  return { value: {
    biography: value.biography.trim(),
    ...(value.travelRatePerKm !== undefined ? { travelRatePerKm: value.travelRatePerKm as number } : currentProfile?.travelRatePerKm !== undefined ? { travelRatePerKm: currentProfile.travelRatePerKm } : {}),
    specialties: value.specialties.map((specialty: string) => specialty.trim()),
    hourlyRate: value.hourlyRate,
    teachingModalities: value.teachingModalities as ITutorProfile['teachingModalities'],
    ...(location ? { location } : {}),
    credentials,
    professionalExperience,
    // Client input is never allowed to set credential/profile verification.
    verificationStatus: currentProfile?.verificationStatus ?? 'pending',
    ...(currentProfile?.reviewNote !== undefined ? { reviewNote: currentProfile.reviewNote } : {}),
    ...(currentProfile?.reviewedAt ? { reviewedAt: currentProfile.reviewedAt } : {}),
  } };
}

function ownerProfile(user: ProfileDocument) {
  return {
    id: String(user._id),
    fullName: user.fullName,
    email: user.email,
    ...(user.profileImageUrl ? { profileImageUrl: user.profileImageUrl } : {}),
    role: user.role,
    onboardingCompleted: user.onboardingCompleted ?? Boolean(user.role),
    accountStatus: user.accountStatus,
    ...(user.personal ? { personal: user.personal } : {}),
    ...(user.studentProfile ? { studentProfile: user.studentProfile } : {}),
    ...(user.tutorProfile ? { tutorProfile: user.tutorProfile } : {}),
  };
}

export function createProfileHandlers(dependencies: ProfileControllerDependencies = defaultDependencies) {
  return {
    async getMine(request: Request, response: Response): Promise<void> {
      if (!request.authUser) { response.status(401).json({ error: 'Authentication is required.' }); return; }
      try {
        const user = await dependencies.findById(request.authUser.id);
        if (!user) { response.status(404).json({ error: 'Profile not found.' }); return; }
        response.status(200).json({ user: ownerProfile(user) });
      } catch {
        response.status(500).json({ error: 'Profile could not be retrieved right now.' });
      }
    },

    async updateMine(request: Request, response: Response): Promise<void> {
      if (!request.authUser) { response.status(401).json({ error: 'Authentication is required.' }); return; }
      if (!isRecord(request.body) || !hasOnlyKeys(request.body, ['profile', 'personal']) || !isRecord(request.body.profile)) {
        response.status(400).json({ error: 'Send only the profile fields to update.' });
        return;
      }
      if (request.authUser.role !== 'student' && request.authUser.role !== 'tutor') {
        response.status(403).json({ error: 'This account cannot edit a learner or tutor profile.' });
        return;
      }

      try {
        const user = await dependencies.findById(request.authUser.id);
        if (!user) { response.status(404).json({ error: 'Profile not found.' }); return; }
        if (user.accountStatus !== 'active' || user.role !== request.authUser.role) {
          response.status(403).json({ error: 'This account cannot update this profile.' });
          return;
        }
        let personal: IUser['personal'];
        try {
          if (request.body.personal !== undefined) {
            personal = validatePersonalDetails(request.body.personal);
            assertRequiredOnboarding(request.body.profile, user.role!);
          } else if (user.personal) {
            // Completed extended profiles cannot erase required location/evidence.
            assertRequiredOnboarding(request.body.profile, user.role!);
          }
        } catch (error) { response.status(400).json({ error: (error as Error).message }); return; }

        if (user.role === 'student') {
          const result = validateStudentProfile(request.body.profile);
          if ('error' in result) { response.status(400).json({ error: result.error }); return; }
          user.studentProfile = result.value;
        } else {
          const result = validateTutorProfile(request.body.profile, user.tutorProfile);
          if ('error' in result) { response.status(400).json({ error: result.error }); return; }
          user.tutorProfile = result.value;
        }

        if (personal) user.personal = personal;
        await user.save();
        response.status(200).json({ user: ownerProfile(user) });
      } catch (error) {
        if (error instanceof mongoose.Error.VersionError) {
          response.status(409).json({ error: 'Tu perfil cambió mientras lo editabas. Vuelve a abrirlo antes de guardar.' }); return;
        }
        if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
          response.status(400).json({ error: 'Profile fields do not satisfy the validation rules.' });
          return;
        }
        response.status(500).json({ error: 'Profile could not be updated right now.' });
      }

    },
  };
}
export async function completeOnboarding(
  request: Request,
  response: Response,
): Promise<void> {
  if (!request.authUser) {
    response.status(401).json({
      error: 'Debes iniciar sesión.',
    });
    return;
  }

  const body: unknown = request.body;

  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, ['role', 'profile', 'personal']) ||
    !isRecord(body.profile)
  ) {
    response.status(400).json({
      error: 'Envía el rol y los datos del perfil.',
    });
    return;
  }

  const { role, profile } = body;

  if (role !== 'student' && role !== 'tutor') {
    response.status(400).json({
      error: 'Selecciona estudiante o catedrático.',
    });
    return;
  }
  let personal;
  try { personal = validatePersonalDetails(body.personal); assertRequiredOnboarding(profile, role); }
  catch (error) { response.status(400).json({ error: (error as Error).message }); return; }

 
  const studentResult =
    role === 'student' ? validateStudentProfile(profile) : undefined;

  const tutorResult =
    role === 'tutor' ? validateTutorProfile(profile, undefined) : undefined;

  if (studentResult && 'error' in studentResult) {
    response.status(400).json({ error: studentResult.error });
    return;
  }

  if (tutorResult && 'error' in tutorResult) {
    response.status(400).json({ error: tutorResult.error });
    return;
  }

  const fields = studentResult && 'value' in studentResult
    ? {
        role: 'student',
        studentProfile: studentResult.value,
        onboardingCompleted: true,
      }
    : tutorResult && 'value' in tutorResult
      ? {
          role: 'tutor',
          tutorProfile: {
            ...tutorResult.value,
            verificationStatus: 'pending',
          },
          onboardingCompleted: true,
        }
      : undefined;

  if (!fields) {
    response.status(400).json({ error: 'El perfil no es válido.' });
    return;
  }

  try {
    const user = await User.findOneAndUpdate(
      {
        _id: request.authUser.id,
        accountStatus: 'active',
        onboardingCompleted: false,
        role: { $exists: false },
      },
      { $set: { ...fields, personal }, $inc: { __v: 1 } },
      { new: true, runValidators: true },
    );

    if (!user) {
      response.status(409).json({
        error: 'Esta cuenta no tiene un registro pendiente disponible.',
      });
      return;
    }

    response.status(200).json({
      user: {
        ...ownerProfile(user),
        onboardingCompleted: user.onboardingCompleted ?? Boolean(user.role),
      },
    });


  } catch (error) {
    if (
      error instanceof mongoose.Error.ValidationError ||
      error instanceof mongoose.Error.CastError
    ) {
      response.status(400).json({
        error: 'Revisa los datos del formulario.',
      });
      return;
    }

    response.status(500).json({
      error: 'No se pudo completar el registro.',
    });
  }
}

const handlers = createProfileHandlers();
export const getMyProfile = handlers.getMine;
export const updateMyProfile = handlers.updateMine;
