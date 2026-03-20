import { useLocation } from "react-router-dom";
import { Construction } from "lucide-react";

export default function ComingSoon() {
  const location = useLocation();
  const name = location.pathname.slice(1).replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-reveal-up">
      <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
        <Construction className="h-8 w-8 text-accent-foreground" />
      </div>
      <h1 className="text-xl font-bold text-foreground">{name || "Page"}</h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-sm">
        This module is coming soon. We're building it as part of the PartnerOS platform.
      </p>
    </div>
  );
}
