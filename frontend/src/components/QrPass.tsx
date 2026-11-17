import QRCode from "react-qr-code";

export default function QrPass({ value, size = 220 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <QRCode value={value} size={size} bgColor="#ffffff" fgColor="#0f172a" level="M" />
    </div>
  );
}
