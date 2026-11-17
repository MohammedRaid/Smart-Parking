import { STATUS_STYLES } from "../lib/format";

export default function StatusPill({ status }: { status: string }) {
  const meta = STATUS_STYLES[status] ?? {
    label: status.replace(/_/g, " "),
    className: "bg-slate-100 text-slate-600",
  };
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}
