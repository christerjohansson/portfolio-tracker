import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Upload, ChevronRight, Check } from "lucide-react";
import type { ImportResult, ImportRow } from "../../../server/importers/types";
import type { Asset } from "@shared/schema";

export default function Import() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<string>("unknown");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [previewData, setPreviewData] = useState<ImportResult | null>(null);
  const [assetMapping, setAssetMapping] = useState<Record<string, number>>({});
  
  const { data: assets = [] } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });

  const previewMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", "/api/import/preview", {
        csv: content,
        source: source === "unknown" ? undefined : source
      });
      return (await res.json()) as ImportResult;
    },
    onSuccess: (data) => {
      if (data.errors?.length) {
        toast({ title: "Fel vid inläsning", description: data.errors.join(", "), variant: "destructive" });
        return;
      }
      setPreviewData(data);
      setStep(2);
      
      // Auto-map where possible
      const initialMapping: Record<string, number> = {};
      const existingNames = new Map(assets.map(a => [a.name.toLowerCase(), a.id]));
      data.rows.forEach(r => {
        const id = existingNames.get(r.assetName.toLowerCase());
        if (id) initialMapping[r.assetName] = id;
      });
      setAssetMapping(initialMapping);
    },
    onError: (err) => {
      toast({ title: "Kunde inte läsa upp filen", description: err.message, variant: "destructive" });
    }
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/import/execute", {
        rows: previewData?.rows,
        assetMapping
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Import klar", description: `${data.createdTransactions} transaktioner skapades.` });
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/holdings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dividends"] });
      setStep(3);
    },
    onError: (err) => {
      toast({ title: "Import misslyckades", description: err.message, variant: "destructive" });
    }
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handlePreview = () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      previewMutation.mutate(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 space-y-8 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold">Importera transaktioner</h1>
        <p className="text-sm text-muted-foreground">Stöd för Avanza, Nordnet och Binance CSV-exporter</p>
      </div>

      <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground border-b border-border pb-4">
        <div className={`flex items-center gap-2 ${step >= 1 ? "text-primary" : ""}`}>
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">1</div>
          Ladda upp
        </div>
        <ChevronRight size={16} />
        <div className={`flex items-center gap-2 ${step >= 2 ? "text-primary" : ""}`}>
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">2</div>
          Granska & Mappa
        </div>
        <ChevronRight size={16} />
        <div className={`flex items-center gap-2 ${step >= 3 ? "text-primary" : ""}`}>
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">3</div>
          Klar
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6 bg-card border border-border p-6 rounded-lg">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Källa</label>
              <select 
                value={source} 
                onChange={e => setSource(e.target.value)}
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="unknown">Automatisk identifiering</option>
                <option value="avanza">Avanza</option>
                <option value="nordnet">Nordnet</option>
                <option value="binance">Binance (Spot Trade History)</option>
              </select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Välj fil</label>
              <div className="mt-1 border-2 border-dashed border-border rounded-lg p-12 text-center hover:bg-muted/50 transition-colors">
                <input 
                  type="file" 
                  accept=".csv,.txt"
                  id="file-upload" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <Upload className="h-8 w-8 text-muted-foreground mb-4" />
                  <span className="text-sm font-semibold">{file ? file.name : "Klicka för att välja CSV-fil"}</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handlePreview}
                disabled={!file || previewMutation.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {previewMutation.isPending ? "Läser in..." : "Fortsätt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 2 && previewData && (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-lg overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-border bg-muted/30">
              <h3 className="font-semibold text-sm">Hittade {previewData.rows.length} transaktioner (Källa: {previewData.source})</h3>
              {previewData.unmappedAssets.length > 0 && (
                <p className="text-sm text-destructive mt-1">
                  Mappa tillgångarna nedan innan du går vidare.
                </p>
              )}
            </div>
            
            <div className="overflow-auto flex-1 p-4">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium">Datum</th>
                    <th className="px-3 py-2 font-medium">Typ</th>
                    <th className="px-3 py-2 font-medium">Tillgång</th>
                    <th className="px-3 py-2 font-medium">Antal</th>
                    <th className="px-3 py-2 font-medium">Pris</th>
                    <th className="px-3 py-2 font-medium">Mappning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewData.rows.map((row, i) => {
                    const needsMapping = !assetMapping[row.assetName];
                    return (
                      <tr key={i} className={needsMapping ? "bg-destructive/5" : ""}>
                        <td className="px-3 py-2 whitespace-nowrap">{row.date}</td>
                        <td className="px-3 py-2 uppercase text-xs">{row.type}</td>
                        <td className="px-3 py-2 font-medium">{row.assetName}</td>
                        <td className="px-3 py-2">{row.quantity}</td>
                        <td className="px-3 py-2">
                          {row.price} {row.currency}
                        </td>
                        <td className="px-3 py-2">
                          {needsMapping ? (
                            <select
                              className="text-xs border border-destructive rounded p-1 w-full max-w-[200px]"
                              onChange={(e) => setAssetMapping(prev => ({...prev, [row.assetName]: Number(e.target.value)}))}
                            >
                              <option value="">-- Välj befintlig tillgång --</option>
                              {assets.map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs text-green-500 flex items-center gap-1">
                              <Check size={12} /> Mappad
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center bg-card p-4 rounded-lg border border-border">
            <button
              onClick={() => { setStep(1); setPreviewData(null); }}
              className="px-4 py-2 border border-input bg-background rounded-md text-sm font-medium hover:bg-muted"
            >
              Tillbaka
            </button>
            
            <button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending || previewData.rows.some(r => !assetMapping[r.assetName])}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {executeMutation.isPending ? "Importerar..." : "Slutför import"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-card border border-border p-12 rounded-lg text-center space-y-4">
          <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} />
          </div>
          <h2 className="text-2xl font-bold">Import slutförd!</h2>
          <p className="text-muted-foreground text-sm">Transaktionerna har lagts till i din portfölj.</p>
          <div className="pt-6">
            <button
              onClick={() => {
                setStep(1);
                setFile(null);
                setPreviewData(null);
                setAssetMapping({});
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
            >
              Importera en ny fil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
