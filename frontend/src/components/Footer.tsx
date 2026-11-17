import { Link } from "react-router-dom";
import { ParkingCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-brand-800">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-700 text-white">
              <ParkingCircle size={18} />
            </span>
            <span className="font-extrabold">
              Smart<span className="text-brand-600">Park</span>
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Reserve a verified parking spot in seconds, or turn your unused land into monthly income.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">For drivers</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/map" className="hover:text-brand-700">Find parking</Link></li>
            <li><Link to="/bookings" className="hover:text-brand-700">My bookings</Link></li>
            <li><Link to="/register" className="hover:text-brand-700">Create an account</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">For landowners</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/landowner/register" className="hover:text-brand-700">List your land</Link></li>
            <li><Link to="/landowner/login" className="hover:text-brand-700">Landowner login</Link></li>
            <li><Link to="/landowner/earnings" className="hover:text-brand-700">Earnings dashboard</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">Platform</h4>
          <ul className="mt-3 space-y-2 text-sm text-slate-500">
            <li><Link to="/admin/login" className="hover:text-brand-700">Admin console</Link></li>
            <li><a href="/api/health" className="hover:text-brand-700">API status</a></li>
            <li><span className="text-slate-400">Support · support@smartpark.in</span></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} SmartPark. Demo project with simulated payments unless Razorpay keys are configured.
      </div>
    </footer>
  );
}
