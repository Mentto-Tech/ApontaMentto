import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { Pen, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface SignInfo {
  id: string;
  month: string;
  status: string;
  employeeName: string;
  managerName: string;
  managerSignature: string | null;
  expiresAt: string;
}

const SignTimesheet = () => {
  const { token } = useParams<{ token: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [info, setInfo] = useState<SignInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch<SignInfo>(`/api/timesheets/sign-request/${token}/info`)
      .then(setInfo)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const getCoords = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  // Register touch events as non-passive to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      isDrawingRef.current = true;
      setIsDrawing(true);
      const { x, y } = getCoords(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#000";
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasSignature(true);
    };

    const onTouchEnd = () => { isDrawingRef.current = false; setIsDrawing(false); };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDraw = (e: React.MouseEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    );
  };

  const draw = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(
      (e.clientX - rect.left) * (canvas.width / rect.width),
      (e.clientY - rect.top) * (canvas.height / rect.height),
    );
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDraw = () => { isDrawingRef.current = false; setIsDrawing(false); };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async () => {
    if (!hasSignature || !canvasRef.current || !token) return;
    const employeeSignature = canvasRef.current.toDataURL("image/png");
    setSubmitting(true);
    try {
      await apiFetch(`/api/timesheets/sign-request/${token}/employee-sign`, {
        method: "POST",
        body: { token, employee_signature: employeeSignature },
      });
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao assinar");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="animate-spin h-8 w-8 text-primary" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <h2 className="text-xl font-semibold">Link inválido ou expirado</h2>
      <p className="text-muted-foreground">{error}</p>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <CheckCircle className="h-12 w-12 text-green-500" />
      <h2 className="text-xl font-semibold">Folha assinada com sucesso!</h2>
      <p className="text-muted-foreground">O gestor foi notificado por email e pode baixar o documento completo.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Assinar Folha de Ponto</h1>
          <p className="text-muted-foreground mt-1">
            {info?.month} — {info?.employeeName}
          </p>
          <p className="text-sm text-muted-foreground">Gestor: {info?.managerName}</p>
        </div>

        {info?.managerSignature && (
          <div className="border rounded-lg p-4 bg-card">
            <p className="text-sm font-medium mb-2">Assinatura do gestor ({info.managerName}):</p>
            <img
              src={info.managerSignature}
              alt="Assinatura do gestor"
              className="max-h-20 border rounded bg-white"
            />
          </div>
        )}

        <div className="border rounded-lg p-4 bg-card space-y-3">
          <p className="text-sm font-medium flex items-center gap-2">
            <Pen className="h-4 w-4" /> Sua assinatura
          </p>
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            className="w-full border rounded bg-white touch-none cursor-crosshair"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
          />
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={clearSignature}>Limpar</Button>
            {hasSignature && <span className="text-sm text-green-600">✓ Assinatura registrada</span>}
          </div>
        </div>

        <Button
          className="w-full"
          size="lg"
          disabled={!hasSignature || submitting}
          onClick={handleSubmit}
        >
          {submitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
          Confirmar Assinatura
        </Button>
      </div>
    </div>
  );
};

export default SignTimesheet;
