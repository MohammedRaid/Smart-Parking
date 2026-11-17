import { Link } from "react-router-dom";
import { MapPin, Star } from "lucide-react";
import type { ParkingLocation } from "../lib/types";
import { inr } from "../lib/format";
import AvailabilityBadge from "./AvailabilityBadge";

export default function ParkingCard({
  location,
  query,
}: {
  location: ParkingLocation;
  query?: { date: string; start: string; end: string };
}) {
  const image = location.images[0];
  const params = new URLSearchParams({
    ...(query ? { date: query.date, start: query.start, end: query.end } : {}),
  });
  const href = `/parking/${location.id}${params.toString() ? `?${params.toString()}` : ""}`;

  return (
    <article className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-40 w-full overflow-hidden bg-slate-100">
        {image ? (
          <img
            src={image}
            alt={location.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-brand-700 to-brand-900 text-sm font-semibold text-white/80">
            {location.name}
          </div>
        )}
        <div className="absolute left-3 top-3">
          <AvailabilityBadge availability={location.availability} compact />
        </div>
        {location.rating.count > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-xs font-bold text-slate-700 shadow">
            <Star size={12} className="fill-amber-400 text-amber-400" />
            {location.rating.average}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold text-slate-900">{location.name}</h3>
        <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
          <MapPin size={13} className="mt-0.5 shrink-0" />
          <span className="line-clamp-2">{location.address}</span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">{inr(location.price_hourly)}/hr</span>
          <span>{inr(location.price_daily)}/day</span>
          <span>{inr(location.price_monthly)}/mo</span>
          {location.distance_km !== null && (
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
              {location.distance_km < 1 ? `${Math.round(location.distance_km * 1000)} m` : `${location.distance_km} km`}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            {location.availability?.available_slots ?? 0}/{location.total_slots} slots free
          </span>
          <Link to={href} className="btn-primary px-3.5 py-2 text-xs">
            Book now
          </Link>
        </div>
      </div>
    </article>
  );
}
