import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crosshair, ImagePlus, Loader2, MapPin, Trash2, Upload } from "lucide-react";
import { api, uploadImage } from "../lib/api";
import MapView from "../components/MapView";
import Alert from "../components/Alert";

const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

export default function AddParking() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    address: "",
    city: "",
    area: "",
    latitude: DEFAULT_CENTER[0],
    longitude: DEFAULT_CENTER[1],
    total_slots: 5,
    price_hourly: 30,
    price_daily: 220,
    price_monthly: 3500,
    open_time: "06:00",
    close_time: "23:00",
  });
  const [images, setImages] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const update = (key: keyof typeof form, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const useGps = () => {
    if (!navigator.geolocation) {
      setGeoMessage("GPS is not supported by this browser — pick the spot on the map instead.");
      return;
    }
    setGeoMessage("Locating you…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
        }));
        setGeoMessage("Pin moved to your current GPS position.");
      },
      () => setGeoMessage("Location permission denied — tap the map to set the pin."),
    );
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 4)) {
        urls.push(await uploadImage(file));
      }
      setImages((prev) => [...prev, ...urls].slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/landowner/locations", {
        method: "POST",
        body: { ...form, images },
      });
      navigate("/landowner");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the listing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/landowner" className="text-sm font-semibold text-slate-500 hover:text-brand-700">
        ← Back to dashboard
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Add a parking location</h1>
      <p className="mt-1 text-sm text-slate-500">
        New listings are reviewed by an administrator before they appear on the public map.
      </p>

      <form onSubmit={submit} className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="card p-5 sm:p-6">
          {error && (
            <div className="mb-4">
              <Alert kind="error">{error}</Alert>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="name">
                Parking name
              </label>
              <input
                id="name"
                required
                className="input"
                placeholder="MG Road Covered Parking"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                className="input min-h-24"
                placeholder="Covered parking with CCTV, 24x7 guard, easy metro access…"
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="address">
                Full address
              </label>
              <input
                id="address"
                required
                className="input"
                placeholder="12, Trinity Circle, MG Road, Bengaluru 560001"
                value={form.address}
                onChange={(event) => update("address", event.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="city">
                  City
                </label>
                <input
                  id="city"
                  required
                  className="input"
                  value={form.city}
                  onChange={(event) => update("city", event.target.value)}
                  placeholder="Bengaluru"
                />
              </div>
              <div>
                <label className="label" htmlFor="area">
                  Area / locality
                </label>
                <input
                  id="area"
                  required
                  className="input"
                  value={form.area}
                  onChange={(event) => update("area", event.target.value)}
                  placeholder="MG Road"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="latitude">
                  Latitude
                </label>
                <input
                  id="latitude"
                  type="number"
                  step="0.000001"
                  required
                  className="input"
                  value={form.latitude}
                  onChange={(event) => update("latitude", Number(event.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="longitude">
                  Longitude
                </label>
                <input
                  id="longitude"
                  type="number"
                  step="0.000001"
                  required
                  className="input"
                  value={form.longitude}
                  onChange={(event) => update("longitude", Number(event.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="total_slots">
                  Total parking slots
                </label>
                <input
                  id="total_slots"
                  type="number"
                  min={1}
                  max={500}
                  required
                  className="input"
                  value={form.total_slots}
                  onChange={(event) => update("total_slots", Number(event.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="price_hourly">
                  Hourly price (₹)
                </label>
                <input
                  id="price_hourly"
                  type="number"
                  min={1}
                  required
                  className="input"
                  value={form.price_hourly}
                  onChange={(event) => update("price_hourly", Number(event.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="price_daily">
                  Daily price (₹)
                </label>
                <input
                  id="price_daily"
                  type="number"
                  min={0}
                  className="input"
                  value={form.price_daily}
                  onChange={(event) => update("price_daily", Number(event.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="price_monthly">
                  Monthly price (₹)
                </label>
                <input
                  id="price_monthly"
                  type="number"
                  min={0}
                  className="input"
                  value={form.price_monthly}
                  onChange={(event) => update("price_monthly", Number(event.target.value))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="open_time">
                  Opens at
                </label>
                <input
                  id="open_time"
                  type="time"
                  className="input"
                  value={form.open_time}
                  onChange={(event) => update("open_time", event.target.value)}
                />
              </div>
              <div>
                <label className="label" htmlFor="close_time">
                  Closes at
                </label>
                <input
                  id="close_time"
                  type="time"
                  className="input"
                  value={form.close_time}
                  onChange={(event) => update("close_time", event.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Photos</label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="btn-secondary text-xs"
                  disabled={uploading}
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? "Uploading…" : "Upload images"}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="hidden"
                  onChange={(event) => void handleUpload(event.target.files)}
                />
                <div className="flex flex-1 gap-2">
                  <input
                    className="input"
                    placeholder="or paste an image URL"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => {
                      if (!imageUrl.trim()) return;
                      setImages((prev) => [...prev, imageUrl.trim()].slice(0, 8));
                      setImageUrl("");
                    }}
                  >
                    <ImagePlus size={14} /> Add
                  </button>
                </div>
              </div>
              {images.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {images.map((image) => (
                    <div key={image} className="relative overflow-hidden rounded-lg border border-slate-200">
                      <img src={image} alt="" className="h-20 w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((row) => row !== image))}
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md bg-white/90 text-rose-600 shadow"
                        aria-label="Remove image"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
            {busy ? "Submitting listing…" : "Submit for approval"}
          </button>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Pick the location</h2>
              <button type="button" onClick={useGps} className="btn-secondary px-2.5 py-1.5 text-xs">
                <Crosshair size={13} /> Use GPS
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Tap anywhere on the map to drop the pin.</p>
            <div className="mt-3">
              <MapView
                pickMode
                onPick={(lat, lng) => setForm((prev) => ({ ...prev, latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) }))}
                pickedPosition={[form.latitude, form.longitude]}
                center={[form.latitude, form.longitude]}
                zoom={14}
                height="320px"
              />
            </div>
            {geoMessage && <p className="mt-2 text-xs font-medium text-slate-500">{geoMessage}</p>}
            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-500">
              {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
            </p>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-bold text-slate-900">What happens next</h2>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-500">
              <li>1. Your listing is submitted with {form.total_slots} slot(s).</li>
              <li>2. An administrator reviews the address and photos.</li>
              <li>3. Once approved it appears on the public map instantly.</li>
            </ol>
          </div>
        </aside>
      </form>
    </div>
  );
}
