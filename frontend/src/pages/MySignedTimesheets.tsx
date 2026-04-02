import { useEffect, useState, useCallback } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SignedPdf { id: string; month: string; userId: string; signedAt?: string; }
interface SignRequest { id: string; month: string; userId: string; status: string; managerSignedAt?: string; employeeSignedAt?: string; }

const statusLabel: Record<string, string> = {
  pending: "Pendente",
  manager_signed: "Aguardando sua assinatura",
  employee_signed: "Assinado por você",
  complete: "Completo",
};

const MySignedTimesheets = () => {
  const [signedPdfs, setSignedPdfs] = useState<SignedPdf[]>([]);
  const [requests, setRequests] = useState<SignRequest[]>([]);
  const [loading, setLoading] = useState(true);

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
    a.href = url;
    a.download = `folha-ponto-${month}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const formatMonth = (m: string) => {
    try {
      const [year, mon] = m.split("-");
      return format(new Date(Number(year), Number(mon) - 1, 1), "MMMM yyyy", { locale: ptBR });
    } catch { return m; }
  };

  const pendingRequests = requests.filter(r => r.status !== "complete");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10 space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6 text-primary" />
        Minhas Folhas de Ponto
      </h1>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin h-6 w-6 text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Pending requests */}
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
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Signed PDFs */}
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
    </div>
  );
};

export default MySignedTimesheets;
