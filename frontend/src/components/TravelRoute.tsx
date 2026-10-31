import { useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getTravelQuote, type TravelQuote } from '../lib/api';

function RouteMap({ quote }: { quote: TravelQuote }) {
  const element = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!element.current) return;
    if (!quote.coordinates.length) return;
    const map = L.map(element.current);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    const points = quote.coordinates.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
    const line = L.polyline(points, { color: '#21745a', weight: 5 }).addTo(map);
    L.circleMarker(points[0], { radius: 7 }).addTo(map).bindTooltip('Salida del catedrático');
    L.circleMarker(points[points.length - 1], { radius: 7 }).addTo(map).bindTooltip('Lugar de la clase');
    map.fitBounds(line.getBounds(), { padding: [20, 20] });
    const observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(element.current);
    return () => { observer.disconnect(); map.remove(); };
  }, [quote]);
  return <div ref={element} style={{ height: 280, width: '100%', margin: '12px 0', zIndex: 0 }} aria-label="Ruta por carretera del catedrático al lugar de la clase" />;
}

export default function TravelRoute({ serviceId }: { serviceId: string }) {
  const [latitude, setLatitude] = useState(''); const [longitude, setLongitude] = useState('');
  const [quote, setQuote] = useState<TravelQuote | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  function locate() {
    setError('');
    if (!navigator.geolocation) { setError('Este navegador no permite obtener la ubicación.'); return; }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => { setLatitude(String(coords.latitude)); setLongitude(String(coords.longitude)); setQuote(null); setBusy(false); }, () => { setBusy(false); setError('No se pudo obtener tu ubicación. Puedes ingresar las coordenadas.'); }, { timeout: 10000 });
  }
  async function calculate() {
    if (!latitude || !longitude) { setError('Indica las coordenadas del lugar de la clase.'); return; }
    setBusy(true); setError(''); setQuote(null);
    try { setQuote(await getTravelQuote(serviceId, Number(latitude), Number(longitude))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo calcular la ruta.'); }
    finally { setBusy(false); }
  }
  return <details className="travel-route"><summary>Ver ruta y calcular movilización</summary>
    <p>Indica dónde recibirás la clase. El cálculo usa el recorrido de ida por carretera.</p>
    <button type="button" disabled={busy} onClick={locate}>Usar mi ubicación</button>
    <label>Latitud<input disabled={busy} type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => { setLatitude(e.target.value); setQuote(null); }} /></label>
    <label>Longitud<input disabled={busy} type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => { setLongitude(e.target.value); setQuote(null); }} /></label>
    <button type="button" disabled={busy} onClick={() => void calculate()}>{busy ? 'Calculando…' : 'Calcular ruta'}</button>
    {error && <p role="alert">{error}</p>}
    {quote && <><RouteMap quote={quote} /><p>{quote.distanceKm.toFixed(1)} km por carretera · {Math.round(quote.durationMinutes)} minutos estimados.</p><strong>Movilización: Q {quote.travelCost.toFixed(2)} por sesión</strong><p>{quote.pricing === 'per_km' ? `Distancia de ida × Q ${quote.travelRatePerKm!.toFixed(2)}/km.` : 'El catedrático todavía utiliza su tarifa fija de traslado.'} El precio por hora se cobra aparte.</p></>}
  </details>;
}
