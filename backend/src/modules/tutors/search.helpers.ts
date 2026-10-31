export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const rad = (degrees: number) => degrees * Math.PI / 180;
  const value = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, value)), Math.sqrt(Math.max(0, 1 - value)));
}

export function serviceSearchFilter(query: { category?: string; modality?: string; minRate?: number; maxRate?: number }) {
  const filter: Record<string, unknown> = {};
  if (query.category) {
    const regex = query.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['category', 'title', 'description'].map((field) => ({ [field]: { $regex: regex, $options: 'i' } }));
  }
  if (query.modality) filter.modality = { $in: query.modality === 'in_person' ? ['at_tutor', 'at_student'] : [query.modality] };
  if (query.minRate !== undefined || query.maxRate !== undefined) filter.hourlyRate = {
    ...(query.minRate !== undefined ? { $gte: query.minRate } : {}),
    ...(query.maxRate !== undefined ? { $lte: query.maxRate } : {}),
  };
  return filter;
}
