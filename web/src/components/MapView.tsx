import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Catch } from '../lib/api';
import type { Pos } from '../lib/geo';
import type { Spot } from '../App';

const pin = (emoji: string, cls = '') =>
  L.divIcon({ className: `pin ${cls}`, html: `<span><i>${emoji}</i></span>`, iconSize: [38, 38], iconAnchor: [19, 38] });

export function MapView({ pos, catches, onPick }: { pos: Pos | null; catches: Catch[]; onPick: (s: Spot) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.Marker | null>(null);
  const centered = useRef(false);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false }).setView([62, 15], 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap',
    }).addTo(m);
    // Håll nere (long-press på mobil) för att pinna en fångst var som helst.
    m.on('contextmenu', (e: L.LeafletMouseEvent) => onPickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    catches.forEach((c) =>
      L.marker([c.lat, c.lng], { icon: pin('🐟') }).addTo(g).bindPopup(
        `<b>${esc(c.species)}</b>${c.length_cm ? ` · ${c.length_cm} cm` : ''}<br>` +
        `${esc(c.lake_name ?? '')}<br><small>${new Date(c.caught_at).toLocaleDateString('sv-SE')}${c.lure ? ` · ${esc(c.lure)}` : ''}</small>`,
      ),
    );
  }, [catches]);

  useEffect(() => {
    const m = map.current;
    if (!m || !pos) return;
    const ll: L.LatLngExpression = [pos.lat, pos.lng];
    if (!me.current) me.current = L.marker(ll, { icon: pin('📍', 'me'), zIndexOffset: -1000 }).addTo(m);
    else me.current.setLatLng(ll);
    if (!centered.current) { centered.current = true; m.setView(ll, 14); }
  }, [pos]);

  const recenter = () => {
    if (pos) map.current?.setView([pos.lat, pos.lng], 15);
  };

  return (
    <div className="mapwrap">
      <div ref={el} className="map" />
      <div className="map-hint">Håll nere på kartan för att pinna en fångst</div>
      <button className="fab" onClick={recenter} aria-label="Hitta mig">🎯</button>
    </div>
  );
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
