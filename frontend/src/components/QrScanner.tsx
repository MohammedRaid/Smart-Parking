import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff } from "lucide-react";

export default function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef({ value: "", at: 0 });
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setError("Camera access was blocked or no camera is available. Use the manual code field below.");
      stop();
    }
  };

  useEffect(() => {
    if (!active) return;
    let frame = 0;

    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height);
          if (result?.data) {
            const now = Date.now();
            if (result.data !== lastRef.current.value || now - lastRef.current.at > 4000) {
              lastRef.current = { value: result.data, at: now };
              onScan(result.data);
            }
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, onScan]);

  useEffect(() => stop, [stop]);

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
        <video ref={videoRef} className="h-64 w-full object-cover" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        {!active && (
          <div className="absolute inset-0 grid place-items-center bg-slate-900/90 px-6 text-center">
            <div>
              <CameraOff className="mx-auto mb-2 text-slate-400" size={28} />
              <p className="text-sm font-medium text-slate-300">Camera is off</p>
              <button type="button" onClick={start} className="btn-primary mt-3 px-4 py-2 text-xs">
                <Camera size={14} /> Start camera
              </button>
            </div>
          </div>
        )}
        {active && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="h-40 w-40 rounded-2xl border-4 border-white/70" />
          </div>
        )}
      </div>
      {active && (
        <button type="button" onClick={stop} className="btn-secondary mt-2 w-full text-xs">
          Stop camera
        </button>
      )}
      {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
