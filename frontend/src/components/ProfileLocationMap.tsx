import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function ProfileLocationMap({ latitude, longitude, onSelect }: { latitude: string; longitude: string; onSelect: (latitude: number, longitude: number) => void }) {
  const container = useRef<HTMLDivElement>(null); const mapRef = useRef<L.Map | null>(null); const markerRef = useRef<L.Marker | null>(null);
  const selectRef = useRef(onSelect); selectRef.current = onSelect;
  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current).setView([14.6349, -90.5069], 12); mapRef.current = map;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
    map.on('click', (event: L.LeafletMouseEvent) => selectRef.current(event.latlng.lat, event.latlng.lng));
    const resize = new ResizeObserver(() => map.invalidateSize()); resize.observe(container.current);
    return () => { resize.disconnect(); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  useEffect(() => {
    const map = mapRef.current, lat = Number(latitude), lng = Number(longitude);
    if (!map) return;
    if (!latitude || !longitude || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { markerRef.current?.remove(); markerRef.current = null; return; }
    if (!markerRef.current) {
      const icon = L.divIcon({ className: 'profile-map-marker', html: '<span aria-hidden="true">●</span>', iconSize: [24, 24], iconAnchor: [12, 12] });
      markerRef.current = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
      markerRef.current.on('dragend', () => { const point = markerRef.current!.getLatLng(); selectRef.current(point.lat, point.lng); });
    } else markerRef.current.setLatLng([lat, lng]);
    map.setView([lat, lng], map.getZoom());
  }, [latitude, longitude]);
  return <div className="profile-map" ref={container} role="region" aria-label="Selecciona tu dirección habitual haciendo clic en el mapa. También puedes ingresar las coordenadas." />;
}
