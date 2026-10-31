import { useEffect, useState } from 'react';
import { getTutorReviews, type ClassReview, type ReviewSummary } from '../lib/api';
export default function TutorReviews({ tutorId }: { tutorId: string }) {
  const [reviews, setReviews] = useState<ClassReview[]>([]); const [summary, setSummary] = useState<ReviewSummary>({ averageRating: null, reviewCount: 0 });
  const [page, setPage] = useState(1); const [pages, setPages] = useState(0); const [revision, setRevision] = useState(0);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { const refresh = () => setRevision((value) => value + 1); window.addEventListener('reviews-updated', refresh); return () => window.removeEventListener('reviews-updated', refresh); }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    getTutorReviews(tutorId, page).then((result) => { if (active) { setReviews(result.data); setSummary(result); setPages(result.totalPages); } }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar las reseñas.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tutorId, page, revision]);
  return <section className="tutor-reviews"><h3>Calificaciones y reseñas</h3><p>{summary.averageRating === null ? 'Sin reseñas de clases completadas todavía.' : `★ ${summary.averageRating.toFixed(1)} de 5 · ${summary.reviewCount} reseña(s)`}</p>{loading && <p role="status">Cargando reseñas…</p>}{error && <p role="alert">{error}</p>}{!loading && reviews.map((review) => <article className="class-review" key={review._id}><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)} · {review.studentName}</strong><small>{review.serviceTitle}{review.createdAt ? ` · ${new Date(review.createdAt).toLocaleDateString('es-GT', { timeZone: 'America/Guatemala' })}` : ''}</small><p>{review.comment}</p></article>)}{pages > 1 && <nav className="tutor-pagination" aria-label="Páginas de reseñas"><button disabled={loading || page === 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{page} de {pages}</span><button disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Siguiente</button></nav>}</section>;
}
