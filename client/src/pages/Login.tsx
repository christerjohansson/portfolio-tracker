import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Lock, LogIn, LogOut, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [password, setPassword] = useState("");
  const { loginMutation, setupMutation, user, isLoading, setupRequired } = useAuth();
  const { toast } = useToast();

  const isSetupMode = setupRequired;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (setupMutation.isPending || loginMutation.isPending) return;

    if (isSetupMode) {
      if (password.length < 4) {
        toast({ title: "Lösenord för kort", variant: "destructive" });
        return;
      }
      setupMutation.mutate(password, {
        onError: () => toast({ title: "Kunde inte spara lösenord", variant: "destructive" })
      });
    } else {
      loginMutation.mutate(password, {
        onError: () => toast({ title: "Fel lösenord", variant: "destructive" })
      });
    }
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-background"><div className="animate-spin text-primary"><Lock /></div></div>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {isSetupMode ? <KeyRound size={24} /> : <Lock size={24} />}
          </div>
          <h1 className="text-2xl font-bold">Portföljtracker</h1>
          <p className="mt-2 text-sm text-muted-foreground text-center">
            {isSetupMode 
              ? "Välkommen! Skapa ett lösenord för din portfölj."
              : "Ange ditt lösenord för att logga in."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
            autoFocus
          />
          <button
            type="submit"
            disabled={setupMutation.isPending || loginMutation.isPending}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {setupMutation.isPending || loginMutation.isPending ? (
              <LogOut className="animate-spin" /> // reuse icon as spinner
            ) : isSetupMode ? (
              <>Skapa <LogIn size={18} /></>
            ) : (
              <>Logga in <LogIn size={18} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
