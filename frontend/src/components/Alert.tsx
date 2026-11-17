import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

type AlertKind = "error" | "success" | "info";

const styles: Record<AlertKind, { wrapper: string; icon: ReactNode }> = {
  error: {
    wrapper: "border-rose-200 bg-rose-50 text-rose-700",
    icon: <AlertCircle size={17} className="shrink-0" />,
  },
  success: {
    wrapper: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: <CheckCircle2 size={17} className="shrink-0" />,
  },
  info: {
    wrapper: "border-sky-200 bg-sky-50 text-sky-800",
    icon: <Info size={17} className="shrink-0" />,
  },
};

export default function Alert({
  kind = "info",
  children,
  className = "",
}: {
  kind?: AlertKind;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm font-medium ${styles[kind].wrapper} ${className}`}>
      {styles[kind].icon}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
