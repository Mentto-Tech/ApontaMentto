import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useExportData, useImportData } from "@/lib/queries";
import { useToast } from "@/hooks/use-toast";
import { useRef } from "react";
import { todayBrForFilename } from "@/lib/datetime";
import "../styles/AdminSettings.css";

export default function AdminSettings() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { refetch: exportData, isFetching: isExporting } = useExportData();
  const { mutate: importData, isPending: isImporting } = useImportData();

  const handleExport = async () => {
    try {
      const { data } = await exportData();
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `apontamentto-export-${todayBrForFilename()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast({ title: "Sucesso", description: "Dados exportados com sucesso." });
      }
    } catch (error) {
      toast({ variant: "destructive", title: "Erro", description: "Falha ao exportar dados." });
    }
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result;
          if (typeof content === "string") {
            const jsonData = JSON.parse(content);
            importData(jsonData, {
              onSuccess: () => toast({ title: "Sucesso", description: "Dados importados com sucesso." }),
              onError: () => toast({ variant: "destructive", title: "Erro", description: "Falha ao importar dados." }),
            });
          }
        } catch (error) {
          toast({ variant: "destructive", title: "Erro", description: "Arquivo JSON inválido." });
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="page-admin-settings">
      <h1 className="admin-settings-title">Configurações de Administrador</h1>
      <Card>
        <CardHeader>
          <CardTitle>Importar/Exportar Dados</CardTitle>
          <CardDescription>
            Exporte todos os dados do sistema para um arquivo JSON ou importe dados de um arquivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="admin-settings-card-actions flex gap-4">
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exportando..." : "Exportar Dados (JSON)"}
          </Button>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting ? "Importando..." : "Importar Dados (JSON)"}
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="application/json"
          />
        </CardContent>
      </Card>
    </div>
  );
}
