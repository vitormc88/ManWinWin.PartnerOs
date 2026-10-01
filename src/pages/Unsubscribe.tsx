import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type State = "loading" | "valid" | "already" | "invalid" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    supabase.functions
      .invoke(`handle-email-unsubscribe?token=${encodeURIComponent(token)}`, { method: "GET" })
      .then(({ data, error }) => {
        if (error) return setState("invalid");
        if (data?.valid === false && data?.reason === "already_unsubscribed") return setState("already");
        setState(data?.valid ? "valid" : "invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("handle-email-unsubscribe", { body: { token } });
    setBusy(false);
    if (error) return setState("error");
    setState(data?.success || data?.reason === "already_unsubscribed" ? "done" : "error");
  };

  const copy: Record<State, { title: string; body: string }> = {
    loading: { title: "Checking your link…", body: "" },
    valid: {
      title: "Stop PartnerOS email notifications?",
      body: "You will stop receiving PartnerOS notification emails at this address. Notifications will still appear inside PartnerOS, and HQ will be told that you no longer receive operational emails.",
    },
    already: { title: "Already stopped", body: "This address no longer receives PartnerOS notification emails." },
    invalid: { title: "Link not valid", body: "This link is invalid or has expired." },
    done: { title: "Email notifications stopped", body: "You will still see every notification inside PartnerOS." },
    error: { title: "Something went wrong", body: "Please try again in a moment." },
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">
        <p className="text-sm font-bold text-foreground mb-6">
          ManWinWin <span className="text-primary">PartnerOS</span>
        </p>
        <h1 className="text-xl font-semibold text-foreground mb-3">{copy[state].title}</h1>
        {copy[state].body && <p className="text-sm text-muted-foreground mb-6">{copy[state].body}</p>}
        {state === "valid" && (
          <Button onClick={confirm} disabled={busy} className="w-full">
            {busy ? "Processing…" : "Stop email notifications"}
          </Button>
        )}
      </div>
    </main>
  );
}
