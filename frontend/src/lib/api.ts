import { socketOrigin } from './urls';
const runtimeEnvironment = import.meta.env ?? {};
// In development, use Vite's same-origin /api proxy so the browser never
// makes a cross-origin request to Express (the dev server may use 5176+).
const apiBaseUrl = (runtimeEnvironment.DEV ? '/api' : runtimeEnvironment.VITE_API_URL ?? '/api').trim().replace(/\/+$/, '');
const sessionStorageKey = 'edumatch_access_token';
export const chatSocketUrl = socketOrigin(apiBaseUrl, runtimeEnvironment.DEV);

export type TeachingModality = 'virtual' | 'at_tutor' | 'at_student';

export interface PublicTutor {
  distanceKm?: number | null;
  averageRating?: number | null;
  reviewCount?: number;
  matchingCourseCount?: number;
  id: string;
  fullName: string;
  profileImageUrl?: string;
  tutorProfile: {
    biography?: string;
    specialties: string[];
    hourlyRate?: number;
    teachingModalities: TeachingModality[];
    location?: { city?: string };
    credentials: Array<{ title: string; institution?: string; description?: string; verified: boolean }>;
    professionalExperience: Array<{ organization: string; position: string; description?: string; startDate?: string; endDate?: string }>;
    verificationStatus: 'pending' | 'verified' | 'rejected';
  };
}

export interface TutorSearch {
  latitude?: number;
  longitude?: number;
  maxDistance?: string;
  minRating?: string;
  category?: string;
  location?: string;
  minRate?: string;
  maxRate?: string;
  modality?: '' | 'virtual' | 'in_person' | 'at_tutor' | 'at_student';
  page?: number;
  limit?: number;
}

export interface TutorSearchResult {
  data: PublicTutor[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function getAccessToken(): string | null {
  return window.sessionStorage.getItem(sessionStorageKey);
}

export function setAccessToken(token: string): void {
  window.sessionStorage.setItem(sessionStorageKey, token);
  window.dispatchEvent(new Event('session-changed'));
}

export function clearAccessToken(): void {
  const existed = Boolean(getAccessToken());
  window.sessionStorage.removeItem(sessionStorageKey);
  if (existed) window.dispatchEvent(new Event('session-changed'));
}
export async function logoutSession(): Promise<void> {
  const token = getAccessToken();
  try { if (token) await request('/auth/logout', { method: 'POST' }, true); }
  finally { if (token === getAccessToken()) clearAccessToken(); }
}
export function expireAccessToken(token: string): void {
  if (token !== getAccessToken()) return;
  clearAccessToken();
  window.dispatchEvent(new Event('session-expired'));
}

async function request<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const token = authenticated ? getAccessToken() : null;
  if (authenticated && !token) throw new Error('Inicia sesión para consultar o guardar tu perfil.');
  if (token && authenticated) headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (authenticated && response.status === 403 && token === getAccessToken() && payload && typeof payload === 'object' && 'code' in payload && payload.code === 'ACCOUNT_SUSPENDED') window.dispatchEvent(new Event('account-status-changed'));
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'No se pudo completar la solicitud.';
    if (authenticated && response.status === 401 && token) expireAccessToken(token);
    throw new Error(message);
  }
  return payload as T;
}

export const moderationRequest = <T,>(path: string, body?: unknown, method = 'POST') => request<T>(`/moderation${path}`, body === undefined ? {} : { method, body: JSON.stringify(body) }, true);
export const getSession = () => request<{ user: OwnProfile }>('/auth/me', {}, true);
export interface Appeal { _id: string; caseId: string; statement: string; suspensionReason: string; status: string; decision?: string; createdAt: string; userId?: { _id: string; fullName: string; email: string } }
export interface SuspensionState { accountStatus: string; suspension?: { reason: string; suspendedAt: string; caseId: string }; appeals: Appeal[] }
export interface ConductReport { _id: string; reporterId: { _id: string; fullName: string; email: string }; targetId: { _id: string; fullName: string; email: string; accountStatus?: string } | null; reason: string; evidence: string; status: string; decision?: string; createdAt: string }
export interface ModeratedUser { _id: string; fullName: string; email: string; accountStatus: string; role: string }
export interface AdminAnalytics { month: string; statuses: { _id: string; count: number }[]; demand: { _id: string; hours: number; sessions: number }[]; best: TutorRank[]; worst: TutorRank[]; users: { _id: string; count: number }[]; openReports: number; pendingAppeals: number }
export interface TutorRank { _id: string; fullName: string; average: number; count: number; accountStatus: string }
export const getAnalytics = (month: string) => request<AdminAnalytics>(`/analytics?month=${encodeURIComponent(month)}`, {}, true);
export interface AcademicCategory { _id: string; name: string; subcategories: string[] }
export const listCategories = () => request<{ data: AcademicCategory[] }>('/categories');
export const saveCategory = (body: { name: string; subcategories: string[] }, id?: string) => request(`/categories${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) }, true);
export const deleteCategory = (id: string) => request(`/categories/${id}`, { method: 'DELETE' }, true);

export function searchTutors(filters: TutorSearch): Promise<TutorSearchResult> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
  return request<TutorSearchResult>(`/tutors?${params.toString()}`);
}

export function getTutor(id: string): Promise<{ data: PublicTutor }> {
  return request<{ data: PublicTutor }>(`/tutors/${encodeURIComponent(id)}`);
}

export interface Slot { _id: string; tutorId: string; serviceId?: string; serviceTitle?: string; date: string; startTime: string; endTime: string; modality: TeachingModality | 'in_person'; available?: boolean; bufferMinutes?: number }
export interface Booking extends Slot { studentId: string; status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rejected'; seriesId?: string; total?: number; hourlyRate?: number; travelCost?: number; studentName?: string; tutorName?: string; legacy?: boolean; destination?: { latitude: number; longitude: number } }
export const getAvailability = (tutorId?: string, serviceId?: string) => request<{ data: Slot[] }>(`/availability?${new URLSearchParams({ ...(tutorId ? { tutorId } : {}), ...(serviceId ? { serviceId } : {}) })}`, {}, Boolean(getAccessToken()));
export const createAvailability = (slot: Omit<Slot, '_id' | 'tutorId'>) => request<{ data: Slot }>('/availability', { method: 'POST', body: JSON.stringify(slot) }, true);
export const removeAvailability = (id: string) => request<void>(`/availability/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
export const createBooking = (slot: Slot) => request<{ data: Booking }>('/bookings', { method: 'POST', body: JSON.stringify({ tutorId: slot.tutorId, date: slot.date, startTime: slot.startTime, endTime: slot.endTime, modality: slot.modality }) }, true);
export const getBookings = () => request<{ data: Booking[] }>('/bookings/me', {}, true);
export const cancelBooking = (id: string) => request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'PATCH' }, true);

export interface OwnProfile {
  personal?: PersonalDetails;
  id: string;
  fullName: string;
  email: string;
  profileImageUrl?: string;
  role?: 'student' | 'tutor' | 'admin';//? Representa una cuenta nueva que aun no tiene rol asignado
  onboardingCompleted: boolean;
  accountStatus: 'active' | 'suspended';
  studentProfile?: {
    location?: { city?: string; address?: string; coordinates?: { latitude: number; longitude: number } };
    subjectPreferences: string[];
    preferredModality?: 'virtual' | 'in_person' | 'both';
  };
  tutorProfile?: {
    reviewNote?: string;
    reviewedAt?: string;
    travelRatePerKm?: number;
    biography: string;
    specialties: string[];
    hourlyRate: number;
    teachingModalities: TeachingModality[];
    location?: { city?: string; address?: string; coordinates?: { latitude: number; longitude: number } };
    credentials: Array<{ title: string; institution?: string; description?: string; evidenceUrl?: string; verified: boolean }>;
    professionalExperience: Array<{ organization: string; position: string; description?: string; startDate?: string; endDate?: string }>;
    verificationStatus: 'pending' | 'verified' | 'rejected';
  };
}
export interface PersonalDetails { phone: string; gender: 'female' | 'male' | 'other' | 'prefer_not_to_say'; documentType: 'dpi' | 'passport' | 'other'; documentNumber: string; categoryAffinity: string[] }

export function getMyProfile(): Promise<{ user: OwnProfile }> {
  return request<{ user: OwnProfile }>('/profiles/me', {}, true);
}

export function updateMyProfile(profile: Record<string, unknown>, personal?: PersonalDetails): Promise<{ user: OwnProfile }> {
  return request<{ user: OwnProfile }>('/profiles/me', { method: 'PUT', body: JSON.stringify({ profile, ...(personal ? { personal } : {}) }) }, true);
}
export function completeOnboarding(
  role: 'student' | 'tutor',
  profile: Record<string, unknown>,
  personal?: PersonalDetails,
): Promise<{ user: OwnProfile }> {
  return request<{ user: OwnProfile }>(
    '/profiles/onboarding',
    {
      method: 'POST',
      body: JSON.stringify({ role, profile, personal }),
    },
    true,//Aqui incluimos el JWT para que el usuario pueda completar su perfil y asignar un rol a su cuenta 
  );
}

export async function loginWithGoogle(credential: string): Promise<void> {
  const result = await request<{ accessToken: string }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
  setAccessToken(result.accessToken);
}

// Chat privado.
export interface ChatMessage { _id: string; conversationId: string; senderId: string; text: string; createdAt: string; readAt: string | null; clientId: string }
export interface ChatConversation { _id: string; peerId: string; peerName: string; unread: number; lastMessage?: ChatMessage }
export const getConversations = () => request<{ data: ChatConversation[] }>('/chat', {}, true);
export const startConversation = (peerId: string) => request<{ data: ChatConversation }>('/chat', { method: 'POST', body: JSON.stringify({ peerId }) }, true);
export const getChatMessages = (id: string, before?: string) => request<{ data: ChatMessage[]; hasMore: boolean }>(`/chat/${encodeURIComponent(id)}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`, {}, true);
export const sendChatMessage = (id: string, text: string, clientId: string) => request<{ data: ChatMessage }>(`/chat/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify({ text, clientId }) }, true);
export const readChatMessages = (id: string, messageIds: string[]) => request<{ conversationId: string; messages: Array<{ _id: string; readAt: string }> }>(`/chat/${encodeURIComponent(id)}/read`, { method: 'POST', body: JSON.stringify({ messageIds }) }, true);

// Cursos, inscripciones y movilización.
export const serviceCategories = ['Matemáticas', 'Idiomas', 'Programación', 'Ciencias', 'Apoyo escolar', 'Preparación para exámenes'] as const;
export interface ServiceDraft { title: string; description: string; category: string; modality: TeachingModality; hourlyRate: number; travelCost: number }
export interface TutoringService extends ServiceDraft { _id: string; tutorId: string; tutorName?: string }
export const listServices = (category = '', modality = '', page = 1) => request<{ data: TutoringService[]; total: number; totalPages: number }>(`/services?${new URLSearchParams({ ...(category ? { category } : {}), ...(modality ? { modality } : {}), page: String(page) })}`);
export const myServices = () => request<{ data: TutoringService[] }>('/services/me', {}, true);
export const saveService = (data: ServiceDraft, id?: string) => request<{ data: TutoringService }>(`/services${id ? `/${encodeURIComponent(id)}` : ''}`, { method: id ? 'PUT' : 'POST', body: JSON.stringify(data) }, true);
export const deleteService = (id: string) => request(`/services/${encodeURIComponent(id)}`, { method: 'DELETE' }, true);
export const getTutorServices = (id: string) => request<{ data: TutoringService[] }>(`/services/tutor/${encodeURIComponent(id)}`);
export interface StudentEnrollment { _id: string; serviceId: string; status?: 'pending' | 'approved' | 'rejected'; serviceTitle?: string; tutorName?: string; updatedAt?: string }
export const getMyEnrollments = () => request<{ data: StudentEnrollment[] }>('/services/enrollments/me', {}, true);
export interface EnrollmentRequest { _id: string; studentName: string; serviceTitle: string; createdAt: string }
export const getEnrollmentRequests = () => request<{ data: EnrollmentRequest[] }>('/services/requests/me', {}, true);
export const decideEnrollment = (id: string, status: 'approved' | 'rejected') => request(`/services/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }, true);
export const enrollInService = (id: string) => request(`/services/${encodeURIComponent(id)}/enroll`, { method: 'POST' }, true);
export const rateService = (id: string, rating: number) => request(`/services/${encodeURIComponent(id)}/rating`, { method: 'POST', body: JSON.stringify({ rating }) }, true);
export interface TravelQuote { distanceKm: number; durationMinutes: number; coordinates: number[][]; travelRatePerKm: number | null; travelCost: number; pricing: 'fixed' | 'per_km' }
export const getTravelQuote = (id: string, latitude: number, longitude: number) => request<TravelQuote>(`/services/${encodeURIComponent(id)}/route`, { method: 'POST', body: JSON.stringify({ latitude, longitude }) }, true);

// Reservas recurrentes y administración.
export interface Recurrence { until: string; weekdays: number[] }
export interface ReservationInput { slotId: string; recurrence?: Recurrence; latitude?: number; longitude?: number; expectedTotal?: number }
export interface BookingQuote { dates: string[]; sessionTotal: number; total: number; hourlyRate: number; travelCost: number }
export const publishCourseSlots = (data: { serviceId: string; date: string; startTime: string; endTime: string; bufferMinutes: number; recurrence?: Recurrence }) => request('/availability', { method: 'POST', body: JSON.stringify(data) }, true);
export const previewReservation = (data: ReservationInput) => request<BookingQuote>('/bookings/preview', { method: 'POST', body: JSON.stringify(data) }, true);
export const reserveCourse = (data: ReservationInput) => request('/bookings', { method: 'POST', body: JSON.stringify(data) }, true);
export const changeReservation = (id: string, action: 'confirm' | 'reject' | 'cancel' | 'complete', entireSeries = false) => request(`/bookings/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ action, entireSeries }) }, true);
export interface ClassReview { _id: string; bookingId?: string; rating: number; comment: string; studentName?: string; serviceTitle?: string; createdAt?: string }
export interface ReviewSummary { averageRating: number | null; reviewCount: number }
export const getTutorReviews = (id: string, page = 1) => request<ReviewSummary & { data: ClassReview[]; totalPages: number }>(`/reviews/tutor/${encodeURIComponent(id)}?page=${page}`);
export const getMyReviews = () => request<{ data: ClassReview[] }>('/reviews/me', {}, true);
export const publishReview = (bookingId: string, rating: number, comment: string) => request<ReviewSummary & { data: ClassReview }>('/reviews', { method: 'POST', body: JSON.stringify({ bookingId, rating, comment }) }, true);
export interface AdminTutor { _id: string; fullName: string; email: string; tutorProfile: NonNullable<OwnProfile['tutorProfile']> }
export const listAdminTutors = (status: string, page = 1) => request<{ data: AdminTutor[]; total: number; totalPages: number }>(`/admin/tutors?${new URLSearchParams({ status, page: String(page) })}`, {}, true);
export const reviewTutor = (id: string, status: 'verified' | 'rejected', note: string) => request(`/admin/tutors/${encodeURIComponent(id)}/review`, { method: 'PATCH', body: JSON.stringify({ status, note }) }, true);
export const resubmitTutor = () => request('/profiles/resubmit', { method: 'POST' }, true);
