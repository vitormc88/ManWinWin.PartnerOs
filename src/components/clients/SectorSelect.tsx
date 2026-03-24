import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SECTOR_OPTIONS } from "@/data/client-field-options";

interface SectorSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function SectorSelect({ value, onChange }: SectorSelectProps) {
  return (
    <Select value={value || "none"} onValueChange={v => onChange(v === "none" ? "" : v)}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue placeholder="Select sector..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— None —</SelectItem>
        {SECTOR_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
