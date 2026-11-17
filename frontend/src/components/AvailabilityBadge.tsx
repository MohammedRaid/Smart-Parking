import type { Availability } from "../lib/types";
import { AVAILABILITY_META } from "../lib/format";

export default function AvailabilityBadge({
  availability,
  compact = false,
}: {
  availability: Availability | null;
  compact?: boolean;
}) {
  if (!availability) return null;
  const meta = AVAILABILITY_META[availability.status];
  return (
    <span className={`badge ${meta.bg} ${meta.text}`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
      {compact
        ? `${availability.available_slots}/${availability.total_slots} free`
        : `${meta.label} · ${availability.available_slots} of ${availability.total_slots} slots free`}
    </span>
  );
}
