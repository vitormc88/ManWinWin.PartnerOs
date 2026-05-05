import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRY_NAME_BY_CODE, ISO_COUNTRIES } from "@/data/iso-countries";
import { cn } from "@/lib/utils";

interface CountryCodeComboboxProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function CountryCodeCombobox({ value, onChange, className, placeholder = "Select country..." }: CountryCodeComboboxProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = value ? COUNTRY_NAME_BY_CODE[value] ?? value : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-10 w-full justify-between font-normal text-sm", !value && "text-muted-foreground", className)}
        >
          {value ? `${selectedLabel} (${value})` : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search country or ISO code..." />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            <CommandGroup>
              {ISO_COUNTRIES.map((country) => (
                <CommandItem
                  key={country.code}
                  value={`${country.name} ${country.code}`}
                  onSelect={() => {
                    onChange(country.code);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === country.code ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">{country.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{country.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
