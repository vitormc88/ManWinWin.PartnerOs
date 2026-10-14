import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SECTOR_OPTIONS } from "@/data/client-field-options";

interface SectorSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}

export function SectorSelect({ value, onChange, id, disabled }: SectorSelectProps) {
  const legacy = !!value && !SECTOR_OPTIONS.some(option => option === value);
  return (
    <Select value={value || "none"} disabled={disabled} onValueChange={v => onChange(v === "none" ? "" : v)}>
      <SelectTrigger id={id} className="h-9 text-sm">
        <SelectValue placeholder="Select sector..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">— None —</SelectItem>
        {legacy && <SelectItem value={value}>{value} (current value)</SelectItem>}
        {SECTOR_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
