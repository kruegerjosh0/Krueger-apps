import React, { useEffect, useRef } from 'react';
import { Customer } from '../../types';
import L from 'leaflet';

interface RegionalMapModalProps {
  customers: Customer[];
  onOpenFolder: (customerId: number) => void;
  onClose: () => void;
}

export const RegionalMapModal: React.FC<RegionalMapModalProps> = ({
  customers,
  onOpenFolder,
  onClose,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, { attributionControl: false }).setView(
        [43.4253, -88.1834],
        10
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;

    // Plot markers
    customers.forEach((c) => {
      // If customer has lat/lng or fallback approximate
      const lat = c.lat || 43.42 + (Math.random() - 0.5) * 0.1;
      const lng = c.lng || -88.18 + (Math.random() - 0.5) * 0.1;

      const hasActive = (c.jobs || []).some((j) => j.status === 'ACTIVE');
      const hasSched = (c.jobs || []).some((j) => j.status === 'SCHEDULED');
      const pinColor = hasActive ? '#30d158' : hasSched ? '#0a84ff' : '#bf5af2';

      const customIcon = L.divIcon({
        className: 'custom-pin',
        html: `<div style="background-color:${pinColor}; width:16px; height:16px; border-radius:50%; border:2px solid #fff; box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(map);

      const popupDiv = document.createElement('div');
      popupDiv.style.fontSize = '12px';
      popupDiv.style.padding = '4px';
      popupDiv.innerHTML = `
        <strong style="color:#bf5af2;">${c.name}</strong><br>
        <span style="color:#555; font-size:10px;">${c.address || 'Local site'}</span><br>
        <button style="margin-top:6px; background:#0a84ff; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-weight:bold; cursor:pointer; width:100%; font-size:10px;">Open Folder</button>
      `;

      popupDiv.querySelector('button')?.addEventListener('click', () => {
        onClose();
        onOpenFolder(c.id);
      });

      marker.bindPopup(popupDiv);
    });

    return () => {
      // Map cleanup handled on modal close
    };
  }, [customers, onOpenFolder, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 animate-in fade-in">
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between border-b border-[var(--border)] pb-3 mb-3 text-[var(--text)]">
        <div>
          <h2 className="text-base font-black text-[var(--accent)] flex items-center gap-2">
            <span>🗺️</span>
            <span>Regional Job Site Map</span>
          </h2>
          <p className="text-[10px] text-[var(--text-muted)]">
            Active and scheduled customer sites across Southeastern Wisconsin
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
        >
          ✕ Back
        </button>
      </div>

      <div
        ref={mapContainerRef}
        className="max-w-4xl w-full mx-auto flex-1 rounded-2xl overflow-hidden shadow-2xl border border-[var(--border)] bg-[var(--surface)]"
      />
    </div>
  );
};
