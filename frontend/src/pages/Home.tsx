import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  CreditCard,
  Landmark,
  MapPin,
  QrCode,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import type { ParkingLocation } from "../lib/types";
import { tomorrowISO } from "../lib/format";
import ParkingCard from "../components/ParkingCard";
import Spinner from "../components/Spinner";

interface Stats {
  parking_spaces: number;
  locations: number;
  cities: number;
  customers: number;
  bookings: number;
}

const LEGEND = [
  { color: "bg-emerald-500", title: "Green – Available", text: "Free slots exist for your chosen date and time." },
  { color: "bg-amber-500", title: "Orange – Partly reserved", text: "Some slots are booked in that window; the rest are free." },
  { color: "bg-rose-500", title: "Red – Full", text: "Every slot is occupied or reserved for that window." },
];

export default function Home() {
  const navigate = useNavigate();
  const [city, setCity] = useState("");
  const [date, setDate] = useState(tomorrowISO());
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("13:00");
  const [stats, setStats] = useState<Stats | null>(null);
  const [featured, setFeatured] = useState<ParkingLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [statsResult, list] = await Promise.all([
          api<Stats>("/api/stats"),
          api<{ results: ParkingLocation[] }>(
            `/api/parking?sort=rating&booking_date=${tomorrowISO()}&start_time=10:00&end_time=13:00`,
          ),
        ]);
        if (!cancelled) {
          setStats(statsResult);
          setFeatured(list.results.slice(0, 3));
        }
      } catch {
        /* the page still works without live stats */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const search = (event: FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ date, start, end });
    if (city.trim()) params.set("city", city.trim());
    navigate(`/map?${params.toString()}`);
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-slate-900">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage: "url(https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=1800&q=60)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
          <span className="badge bg-white/10 text-brand-100 ring-1 ring-white/20">
            <Sparkles size={13} /> Reserve parking before you drive
          </span>
          <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Find a parking spot. <br className="hidden sm:block" />
            <span className="text-brand-300">Book it in 60 seconds.</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-50/90 sm:text-lg">
            Real-time availability on an interactive map, advance reservations for any date, secure online payment and a
            QR pass for entry and exit.
          </p>

          <form onSubmit={search} className="mt-8 max-w-3xl rounded-2xl bg-white p-4 shadow-2xl shadow-brand-950/30">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
              <div>
                <label className="label" htmlFor="city">
                  City or area
                </label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="city"
                    className="input pl-9"
                    placeholder="Bengaluru, Mumbai…"
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="date">
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  className="input"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="start">
                  Arrive
                </label>
                <input id="start" type="time" className="input" value={start} onChange={(event) => setStart(event.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="end">
                  Leave
                </label>
                <input id="end" type="time" className="input" value={end} onChange={(event) => setEnd(event.target.value)} />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full px-5 py-3 lg:w-auto">
                  <Search size={16} /> Search
                </button>
              </div>
            </div>
          </form>

          <div className="mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { value: stats?.locations ?? 0, label: "Locations" },
              { value: stats?.parking_spaces ?? 0, label: "Parking slots" },
              { value: stats?.cities ?? 0, label: "Cities" },
              { value: stats?.customers ?? 0, label: "Drivers" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur">
                <p className="text-2xl font-extrabold text-white">{item.value}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-brand-100/80">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl">
          <span className="badge bg-brand-50 text-brand-700">How SmartPark works</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
            One platform for drivers and landowners
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            Cities lose hours to cars circling for parking while private land sits empty. SmartPark matches the two — with
            real availability, clear pricing and verified entry.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="card p-6 sm:p-7">
            <span className="badge bg-brand-50 text-brand-700">
              <CarFront size={14} /> For drivers
            </span>
            <h3 className="mt-4 text-xl font-bold text-slate-900">Park without the guesswork</h3>
            <ol className="mt-5 space-y-4">
              {[
                { icon: <Search size={16} />, title: "Search by city, area or GPS", text: "See every listed lot around you with its live status." },
                { icon: <CalendarClock size={16} />, title: "Pick date and time", text: "Availability is calculated for your exact arrival and departure window." },
                { icon: <CreditCard size={16} />, title: "Pay securely online", text: "UPI, cards and other Razorpay methods — card details never touch our database." },
                { icon: <QrCode size={16} />, title: "Scan in, scan out", text: "Show your QR pass at the gate. The slot frees up the moment you leave." },
              ].map((step) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    {step.icon}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{step.title}</p>
                    <p className="text-sm leading-relaxed text-slate-500">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link to="/map" className="btn-primary mt-6">
              Find parking now <ArrowRight size={16} />
            </Link>
          </div>

          <div className="card overflow-hidden p-6 sm:p-7">
            <span className="badge bg-amber-50 text-amber-700">
              <Landmark size={14} /> For landowners
            </span>
            <h3 className="mt-4 text-xl font-bold text-slate-900">Your empty land, earning every day</h3>
            <ol className="mt-5 space-y-4">
              {[
                { title: "List the space", text: "Drop a pin on the map, add photos and set hourly, daily or monthly rates." },
                { title: "Get approved", text: "Our admin team verifies each listing to keep the marketplace trustworthy." },
                { title: "Manage reservations", text: "See upcoming bookings, scan QR passes at entry and exit, track slot status." },
                { title: "Track earnings", text: "A live dashboard of payouts, platform fee and per-location performance." },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 font-bold text-amber-700">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{step.title}</p>
                    <p className="text-sm leading-relaxed text-slate-500">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link to="/landowner/register" className="btn-secondary mt-6">
              List your land <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Map legend */}
      <section className="bg-white py-14">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-3">
          <div>
            <span className="badge bg-slate-100 text-slate-600">
              <ShieldCheck size={14} /> Live map indicators
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Know before you drive</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Every marker is calculated for the date and time you select — a lot with a reservation tomorrow evening can
              still be fully open this morning.
            </p>
            <Link to="/map" className="btn-primary mt-5">
              Open the interactive map
            </Link>
          </div>
          <div className="space-y-3 lg:col-span-2">
            {LEGEND.map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl border border-slate-200 p-4">
                <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full ${item.color}`} />
                <div>
                  <p className="text-sm font-bold text-slate-800">{item.title}</p>
                  <p className="text-sm text-slate-500">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Popular parking near you</h2>
            <p className="mt-1 text-sm text-slate-500">Top-rated spaces that drivers book again and again.</p>
          </div>
          <Link to="/map" className="text-sm font-bold text-brand-700 hover:text-brand-800">
            See all locations →
          </Link>
        </div>

        {loading ? (
          <Spinner label="Loading parking spaces…" />
        ) : featured.length === 0 ? (
          <div className="card mt-6 p-8 text-center text-sm text-slate-500">
            No listings are live yet. Start the backend to load the sample data.
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((location) => (
              <ParkingCard
                key={location.id}
                location={location}
                query={{ date: tomorrowISO(), start: "10:00", end: "13:00" }}
              />
            ))}
          </div>
        )}
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6">
        <div className="rounded-3xl bg-gradient-to-r from-brand-800 to-brand-600 px-6 py-10 text-center sm:px-12">
          <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Have unused land? Start earning this week.
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-brand-50/90">
            List for free, set your own price and hours, and get paid for every reservation. SmartPark handles discovery,
            payments and verification.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/landowner/register" className="btn bg-white px-5 py-3 text-brand-800 hover:bg-brand-50">
              Become a landowner
            </Link>
            <Link to="/map" className="btn border border-white/40 px-5 py-3 text-white hover:bg-white/10">
              Explore parking
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
