import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LICENSE_OPTIONS } from "@/data/client-field-options";

interface LicenseSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function LicenseSelect({ value, onChange }: LicenseSelectProps) {
  return (
    <Select value={value || "none"} onValueChange={v => onChange(v === "none" ? "" : v)}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder="Select license..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— None —</SelectItem>
        {LICENSE_OPTIONS.map((l) => (
          <SelectItem key={l} value={l}>{l}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
