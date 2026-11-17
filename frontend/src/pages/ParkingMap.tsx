import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Crosshair, Filter, MapPin, RefreshCw, Search } from "lucide-react";
import { api } from "../lib/api";
import type { ParkingLocation } from "../lib/types";
import { AVAILABILITY_META, tomorrowISO } from "../lib/format";
import { useRealtimeEvents } from "../context/RealtimeContext";
import MapView from "../components/MapView";
import ParkingCard from "../components/ParkingCard";
import Alert from "../components/Alert";
import Spinner from "../components/Spinner";
import { useAuth } from "../context/AuthContext";

const LEGEND = [
  { key: "green" as const, label: "Available" },
  { key: "orange" as const, label: "Partly reserved" },
  { key: "red" as const, label: "Full" },
];

export default function ParkingMap() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const [city, setCity] = useState(params.get("city") ?? "");
  const [date, setDate] = useState(params.get("date") ?? tomorrowISO());
  const [start, setStart] = useState(params.get("start") ?? "10:00");
  const [end, setEnd] = useState(params.get("end") ?? "13:00");
  const [sort, setSort] = useState<"distance" | "price" | "rating">("rating");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locations, setLocations] = useState<ParkingLocation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        booking_date: date,
        start_time: start,
        end_time: end,
        sort: coords ? "distance" : sort,
      });
      if (city.trim()) query.set("city", city.trim());
      if (availableOnly) query.set("available_only", "true");
      if (coords) {
        query.set("lat", String(coords.lat));
        query.set("lng", String(coords.lng));
      }
      const data = await api<{ results: ParkingLocation[] }>(`/api/parking?${query.toString()}`);
      setLocations(data.results);
      setSelectedId((current) =>
        current && data.results.some((row) => row.id === current) ? current : (data.results[0]?.id ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load parking locations");
    } finally {
      setLoading(false);
    }
  }, [availableOnly, city, coords, date, end, sort, start]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents(
    ["availability_changed", "booking_paid", "booking_cancelled", "booking_verified", "booking_completed", "listing_updated", "listing_deleted"],
    () => {
      void load();
    },
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoMessage("This browser does not support GPS location. Search by city or area instead.");
      return;
    }
    setGeoMessage("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setGeoMessage("Showing parking sorted by distance from your GPS position.");
      },
      () => setGeoMessage("Location permission was denied — you can still search by city or area."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const selected = locations.find((location) => location.id === selectedId) ?? null;
  const center: [number, number] = selected
    ? [selected.latitude, selected.longitude]
    : coords
      ? [coords.lat, coords.lng]
      : [12.9716, 77.5946];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Find parking</h1>
          <p className="mt-1 text-sm text-slate-500">
            Availability is calculated for your selected date and time window.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {LEGEND.map((item) => (
            <span key={item.key} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${AVAILABILITY_META[item.key].dot}`} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="card mt-5 p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label className="label" htmlFor="map-city">
              City or area
            </label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="map-city"
                className="input pl-9"
                placeholder="Bengaluru"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="map-date">
              Date
            </label>
            <input id="map-date" type="date" className="input" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="map-start">
              Arrive
            </label>
            <input id="map-start" type="time" className="input" value={start} onChange={(event) => setStart(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="map-end">
              Leave
            </label>
            <input id="map-end" type="time" className="input" value={end} onChange={(event) => setEnd(event.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="map-sort">
              Sort by
            </label>
            <select
              id="map-sort"
              className="input"
              value={sort}
              onChange={(event) => setSort(event.target.value as "distance" | "price" | "rating")}
            >
              <option value="rating">Top rated</option>
              <option value="price">Lowest price</option>
              <option value="distance">Nearest</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={useMyLocation} className="btn-secondary text-xs">
            <Crosshair size={14} /> Use my GPS location
          </button>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(event) => setAvailableOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-700"
            />
            <Filter size={13} /> Only show locations with free slots
          </label>
          <button type="button" onClick={() => void load()} className="ml-auto btn-secondary text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {geoMessage && <p className="mt-2 text-xs font-medium text-slate-500">{geoMessage}</p>}
      </div>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <MapView
            locations={locations}
            selectedId={selectedId}
            onSelect={setSelectedId}
            center={center}
            zoom={selected ? 15 : 12}
            height="560px"
            query={{ date, start, end }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {locations.slice(0, 12).map((location) => (
              <button
                key={location.id}
                type="button"
                onClick={() => setSelectedId(location.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  location.id === selectedId
                    ? "border-brand-700 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${AVAILABILITY_META[location.availability?.status ?? "green"].dot}`} />
                {location.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">
              {loading ? "Searching…" : `${locations.length} location${locations.length === 1 ? "" : "s"} found`}
            </p>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <MapPin size={13} /> {date} · {start}–{end}
            </span>
          </div>

          {loading ? (
            <Spinner label="Checking live availability…" />
          ) : locations.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">No parking found for these filters.</p>
              <p className="mt-1 text-sm text-slate-500">Try a different area, date or time window.</p>
            </div>
          ) : (
            <div className="max-h-[640px] space-y-4 overflow-y-auto pr-1">
              {locations.map((location) => (
                <div
                  key={location.id}
                  onMouseEnter={() => setSelectedId(location.id)}
                  className={location.id === selectedId ? "rounded-2xl ring-2 ring-brand-600" : ""}
                >
                  <ParkingCard location={location} query={{ date, start, end }} />
                </div>
              ))}
            </div>
          )}

          {!user && locations.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-brand-200 bg-brand-50/60 p-4 text-sm">
              <p className="font-bold text-brand-900">Log in to reserve a slot</p>
              <p className="mt-1 text-brand-800/80">Availability is live — sign in to hold a slot for your window.</p>
              <Link to="/login" className="btn-primary mt-3 px-4 py-2 text-xs">
                Log in or sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
