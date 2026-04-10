import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Asset, Holding } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, FileText } from "lucide-react";

interface Props {
  holdings: Holding[];
  assets: Asset[];
}

export function AddQuickEntry({ holdings, assets }: Props) {
  const { toast } = useToast();
  const assetMap = new Map(assets.map(a => [a.id, a]));

  // Quick form state
  const [holdingId, setHoldingId] = useState("");
  const [type, setType] = useState("deposit");
  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  // Smart parser state
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<any>(null);

  const addTx = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/transactions", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Transaktion tillagd" });
      setAmount(""); setQuantity(""); setNotes("");
    },
    onError: () => toast({ title: "Fel", description: "Kunde inte lägga till transaktion.", variant: "destructive" }),
  });

  const parseText = useMutation({
    mutationFn: (text: string) => apiRequest("POST", "/api/parse-transaction", { text }),
    onSuccess: (data: any) => {
      setParsed(data.parsed);
      if (data.parsed.type) setType(data.parsed.type);
      if (data.parsed.date) setDate(data.parsed.date);
      if (data.parsed.amount) setAmount(String(data.parsed.amount));
      if (data.parsed.quantity) setQuantity(String(data.parsed.quantity));
      if (data.parsed.price) setPrice(String(data.parsed.price));
    },
  });

  const handleSubmit = () => {
    if (!holdingId || !amount) {
      toast({ title: "Fyll i alla obligatoriska fält", variant: "destructive" });
      return;
    }
    addTx.mutate({
      holdingId: Number(holdingId),
      type,
      date,
      amount: Number(amount),
      quantity: quantity ? Number(quantity) : null,
      price: price ? Number(price) : null,
      fees: 0,
      notes: notes || null,
    });
  };

  return (
    <Tabs defaultValue="quick">
      <TabsList className="w-full mb-4">
        <TabsTrigger value="quick" className="flex-1 text-xs gap-1"><Plus size={12} />Snabb</TabsTrigger>
        <TabsTrigger value="import" className="flex-1 text-xs gap-1"><FileText size={12} />Importera</TabsTrigger>
      </TabsList>

      <TabsContent value="quick" className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Innehav *</label>
          <Select value={holdingId} onValueChange={setHoldingId}>
            <SelectTrigger data-testid="select-holding" className="h-8 text-xs">
              <SelectValue placeholder="Välj innehav..." />
            </SelectTrigger>
            <SelectContent>
              {holdings.map(h => {
                const a = assetMap.get(h.assetId);
                return (
                  <SelectItem key={h.id} value={String(h.id)}>
                    {a?.name ?? "?"} — {h.account}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Typ</label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Köp</SelectItem>
                <SelectItem value="sell">Sälj</SelectItem>
                <SelectItem value="deposit">Insättning</SelectItem>
                <SelectItem value="withdrawal">Uttag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Datum</label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Belopp *</label>
          <Input
            data-testid="input-amount"
            type="number" placeholder="5000"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="h-8 text-xs tabular-nums"
          />
        </div>

        {(type === "buy" || type === "sell") && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Antal</label>
              <Input type="number" placeholder="10" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Kurs</label>
              <Input type="number" placeholder="123.45" value={price} onChange={e => setPrice(e.target.value)} className="h-8 text-xs tabular-nums" />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Anteckning</label>
          <Input placeholder="Valfri kommentar" value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-xs" />
        </div>

        <button
          data-testid="btn-add-transaction"
          onClick={handleSubmit}
          disabled={addTx.isPending}
          className="w-full h-9 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {addTx.isPending ? "Lägger till…" : "Lägg till transaktion"}
        </button>
      </TabsContent>

      <TabsContent value="import" className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Klistra in en rad från Avanza/Nordnet-export. Systemet försöker tolka datum, typ och belopp automatiskt.
        </p>
        <textarea
          className="w-full h-24 text-xs p-2 rounded-md border border-border bg-background resize-none font-mono"
          placeholder={"2024-03-15\tKöp\tEricsson B\t100\t82,50\t-8250,00\t45321,00\tSEK"}
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />
        <button
          onClick={() => parseText.mutate(pasteText)}
          disabled={!pasteText.trim() || parseText.isPending}
          className="w-full h-8 text-xs font-medium bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-60"
        >
          Tolka rad
        </button>
        {parsed && (
          <div className="text-xs space-y-1 p-3 bg-muted rounded-md">
            <p className="font-semibold text-muted-foreground mb-2">Tolkad data:</p>
            {Object.entries(parsed).filter(([_, v]) => v !== undefined).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <span className="text-muted-foreground w-20 shrink-0">{k}:</span>
                <span className="font-mono">{String(v)}</span>
              </div>
            ))}
            <p className="text-muted-foreground mt-2">Välj innehav i "Snabb"-fliken och fyll i ovanstående värden.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
