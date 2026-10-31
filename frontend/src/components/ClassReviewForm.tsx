import { useState, type FormEvent } from 'react';
import { publishReview, type ClassReview } from '../lib/api';

export default function ClassReviewForm({ bookingId, existing, onSaved }: { bookingId: string; existing?: ClassReview; onSaved: (review: ClassReview) => void }) {
  const [rating, setRating] = useState(0); const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await publishReview(bookingId, rating, comment); onSaved(result.data); window.dispatchEvent(new Event('reviews-updated')); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo guardar la reseña.'); }
    finally { setBusy(false); }
  }
  if (existing) return <div className="class-review"><strong>Tu reseña: {'★'.repeat(existing.rating)}{'☆'.repeat(5 - existing.rating)}</strong><p>{existing.comment}</p></div>;
  return <form className="class-review" onSubmit={submit}><h4>¿Cómo estuvo tu clase?</h4>
    <fieldset disabled={busy}><legend>Calificación</legend><div className="review-stars" role="radiogroup" aria-label="Calificación de la clase">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} estrella${value === 1 ? '' : 's'}`} onClick={() => setRating(value)}>{value <= rating ? '★' : '☆'}</button>)}</div><span>{rating ? `${rating} de 5 estrellas` : 'Selecciona de 1 a 5 estrellas'}</span>
      <label>Comentario<textarea required minLength={3} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
    </fieldset><small>Tu primer nombre, comentario y calificación serán visibles en el perfil del catedrático. Puedes publicar una reseña por clase.</small>
    {error && <p role="alert">{error}</p>}<button className="button button--small" disabled={busy || !rating || comment.trim().length < 3}>{busy ? 'Publicando…' : 'Publicar reseña'}</button>
  </form>;
}
