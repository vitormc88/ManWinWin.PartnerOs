import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useModuleAccess } from "@/hooks/useModuleAccess";
import { Construction } from "lucide-react";

export default function ComingSoon() {
  const location = useLocation();
  const access = useModuleAccess();
  const training = location.pathname === '/training';
  const name = location.pathname.slice(1).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-reveal-up">
      <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <Construction className="h-8 w-8 text-accent-foreground" />
      </div>
      <h1 className="text-xl font-bold text-foreground">{name || "Page"}</h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        {training ? 'Looking for training? Published learning modules and missions are in Partner Academy. Supporting documents are in Knowledge Base. This separate training area is not available yet.' : "This module is coming soon. We're building it as part of the PartnerOS platform."}
      </p>
      {training && <div className="flex flex-wrap justify-center gap-3 mt-5">{access.isResolved && access.canView('onboarding') && <Button asChild><Link to="/academy">Open Partner Academy</Link></Button>}{access.isResolved && access.canView('knowledge_base') && <Button variant="outline" asChild><Link to="/knowledge">Find learning resources</Link></Button>}</div>}
    </div>
  );
}
