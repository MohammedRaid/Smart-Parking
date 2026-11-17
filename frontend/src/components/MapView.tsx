import { useEffect } from "react";
import { Link } from "react-router-dom";
import L from "leaflet";
import type { LeafletMouseEvent } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { ParkingLocation } from "../lib/types";
import { inr } from "../lib/format";
import AvailabilityBadge from "./AvailabilityBadge";

interface MapViewProps {
  locations?: ParkingLocation[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  center?: [number, number];
  zoom?: number;
  height?: string;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  pickedPosition?: [number, number] | null;
  query?: { date: string; start: string; end: string };
}

function pinIcon(status: "green" | "orange" | "red", label: string, selected: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="parking-pin parking-pin--${status}${selected ? " parking-pin--selected" : ""}"><span>${label}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -30],
  });
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.6 });
  }, [center[0], center[1], zoom, map]);
  return null;
}

function PickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event: LeafletMouseEvent) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function MapView({
  locations = [],
  selectedId,
  onSelect,
  center = [12.9716, 77.5946],
  zoom = 12,
  height = "520px",
  pickMode = false,
  onPick,
  pickedPosition = null,
  query,
}: MapViewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm" style={{ height }}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recenter center={center} zoom={zoom} />
        {pickMode && onPick && <PickHandler onPick={onPick} />}
        {pickedPosition && (
          <Marker position={pickedPosition} icon={pinIcon("green", "★", true)}>
            <Popup>Selected parking location</Popup>
          </Marker>
        )}
        {locations.map((location) => {
          const status = location.availability?.status ?? "green";
          return (
            <Marker
              key={location.id}
              position={[location.latitude, location.longitude]}
              icon={pinIcon(status, String(location.availability?.available_slots ?? location.total_slots), location.id === selectedId)}
              eventHandlers={{ click: () => onSelect?.(location.id) }}
            >
              <Popup>
                <div className="min-w-48">
                  <p className="text-sm font-bold text-slate-900">{location.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {location.area}, {location.city}
                  </p>
                  <div className="mt-1.5">
                    <AvailabilityBadge availability={location.availability} compact />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600">
                    {inr(location.price_hourly)}/hour · {location.total_slots} slots
                  </p>
                  {query ? (
                    <Link
                      to={`/parking/${location.id}?date=${query.date}&start=${query.start}&end=${query.end}`}
                      className="mt-2 inline-block text-xs font-bold text-brand-700"
                    >
                      View & book →
                    </Link>
                  ) : (
                    <Link to={`/parking/${location.id}`} className="mt-2 inline-block text-xs font-bold text-brand-700">
                      View & book →
                    </Link>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
