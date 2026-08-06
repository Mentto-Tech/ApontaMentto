import { useEffect, useRef, useState, useCallback } from "react";
import { FileText, Download, Loader2, Pen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface SignedPdf { id: string; month: string; userId: string; signedAt?: string; }
interface SignRequest {
  id: string; month: string; userId: string; status: string;
  managerSignedAt?: string; employeeSignedAt?: string;
}

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  manager_signed: "Aguardando sua assinatura",
  employee_signed: "Aguardando assinatura do gestor",
  complete: "Completo",
};

function previousMonth(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(m: string) {
  try {
    const [year, mon] = m.split("-");
    return format(new Date(Number(year), Number(mon) - 1, 1), "MMMM yyyy", { locale: ptBR });
  } catch { return m; }
}

const SelfSignModal = ({ month, onClose, onSuccess }: {
  month: string; onClose: () => void; onSuccess: () => void;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const getCoords = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.touches[0].clientX - rect.left) * (canvas.width / rect.width),
        y: (e.touches[0].clientY - rect.top) * (canvas.height / rect.height),
      };
    };
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      isDrawingRef.current = true;
      const { x, y } = getCoords(e);
      ctx.beginPath(); ctx.moveTo(x, y);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#000";
      ctx.lineTo(x, y); ctx.stroke();
      setHasSignature(true);
    };
    const onTouchEnd = () => { isDrawingRef.current = false; };
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const startDraw = (e: React.MouseEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
  };
  const draw = (e: React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#000";
    ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
    ctx.stroke(); setHasSignature(true);
  };
  const stopDraw = () => { isDrawingRef.current = false; };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async () => {
    if (!hasSignature || !canvasRef.current) return;
    const employeeSignature = canvasRef.current.toDataURL("image/png");
    setSubmitting(true);
    try {
      await apiFetch("/api/timesheets/sign-request/self", {
        method: "POST",
        body: { month, employee_signature: employeeSignature },
      });
      toast({ title: "Folha assinada!", description: "O gestor será notificado por email para concluir." });
      onSuccess();
    } catch (e: unknown) {
      toast({ title: "Erro ao assinar", description: e instanceof Error ? e.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl w-full max-w-md space-y-4 p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Pen className="h-5 w-5 text-primary" />
          Assinar folha de {formatMonth(month)}
        </h2>
        <p className="text-sm text-muted-foreground">
          Desenhe sua assinatura. O gestor receberá um email para assinar em seguida.
        </p>
        <canvas
          ref={canvasRef}
          width={600}
          height={160}
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
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button className="flex-1" disabled={!hasSignature || submitting} onClick={handleSubmit}>
            {submitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : null}
            Confirmar Assinatura
          </Button>
        </div>
      </div>
    </div>
  );
};

const MySignedTimesheets = () => {
  const [signedPdfs, setSignedPdfs] = useState<SignedPdf[]>([]);
  const [requests, setRequests] = useState<SignRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [signMonth, setSignMonth] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<SignedPdf[]>("/api/timesheets/signed-pdfs"),
      apiFetch<SignRequest[]>("/api/timesheets/my-sign-requests"),
    ])
      .then(([pdfs, reqs]) => { setSignedPdfs(pdfs); setRequests(reqs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDownload = useCallback(async (id: string, month: string) => {
    const blob = await apiFetchBlob(`/api/timesheets/signed-pdfs/${id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `folha-ponto-${month}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const pendingRequests = requests.filter(r => r.status !== "complete");
  const prevMonth = previousMonth();
  const canSelfSign = !requests.some(r => r.month === prevMonth) && !signedPdfs.some(p => p.month === prevMonth);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Minhas Folhas de Ponto
        </h1>
        {canSelfSign && (
          <Button size="sm" onClick={() => setSignMonth(prevMonth)}>
            <Pen className="h-4 w-4 mr-2" />
            Assinar {formatMonth(prevMonth)}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          {pendingRequests.length > 0 && (
            <div className="border rounded-lg p-4 bg-card space-y-2">
              <h2 className="font-semibold text-sm">Aguardando ação</h2>
              <ul className="space-y-1">
                {pendingRequests.map(req => (
                  <li key={req.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                    <div>
                      <span className="font-medium capitalize">{formatMonth(req.month)}</span>
                      <span className="ml-2 text-xs text-amber-600">{statusLabel[req.status] ?? req.status}</span>
                    </div>
                    {req.status === "manager_signed" && (
                      <span className="text-xs text-muted-foreground">Verifique seu email para assinar</span>
                    )}
                    {req.status === "employee_signed" && (
                      <span className="text-xs text-muted-foreground">Aguardando gestor</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border rounded-lg p-4 bg-card space-y-2">
            <h2 className="font-semibold text-sm">Folhas assinadas</h2>
            {signedPdfs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma folha assinada ainda.</p>
            ) : (
              <ul className="space-y-1">
                {signedPdfs.map(pdf => (
                  <li key={pdf.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                    <div>
                      <span className="font-medium capitalize">{formatMonth(pdf.month)}</span>
                      {pdf.signedAt && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {format(new Date(pdf.signedAt), "dd/MM/yyyy")}
                        </span>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(pdf.id, pdf.month)}>
                      <Download className="h-4 w-4 mr-1" /> Baixar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {signMonth && (
        <SelfSignModal
          month={signMonth}
          onClose={() => setSignMonth(null)}
          onSuccess={() => { setSignMonth(null); load(); }}
        />
      )}
    </div>
  );
};

export default MySignedTimesheets;
