export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function estimatePrice(
  location: { price_hourly: number; price_daily: number; price_monthly: number },
  start: string,
  end: string,
): { amount: number; basis: "hourly" | "daily" | "monthly"; label: string } {
  const duration = Math.max(15, timeToMinutes(end) - timeToMinutes(start));
  if (duration >= 24 * 60 && location.price_monthly) {
    return {
      amount: Number(((location.price_monthly / 30) * (duration / (24 * 60))).toFixed(2)),
      basis: "monthly",
      label: "monthly rate",
    };
  }
  if (duration >= 8 * 60 && location.price_daily) {
    const days = Math.ceil(duration / (24 * 60));
    return { amount: Number((location.price_daily * days).toFixed(2)), basis: "daily", label: "daily rate" };
  }
  return {
    amount: Number((location.price_hourly * Math.ceil(duration / 60)).toFixed(2)),
    basis: "hourly",
    label: "hourly rate",
  };
}
