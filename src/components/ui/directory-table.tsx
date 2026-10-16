import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import "./directory-table.css";

/** Shared presentation only: callers retain their own data, access and actions. */
export function DirectoryTable({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="directory-scroll"
      role="region"
      aria-label={`${label} table scroll area`}
      tabIndex={0}
    >
      <table className="directory-table">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

export function DirectorySortHeader<Key extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: Key;
  activeKey: Key;
  dir: "asc" | "desc";
  onSort: (key: Key) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={align === "right" ? "text-right" : "text-left"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="directory-sort"
        aria-label={`Sort by ${label} (${active ? (dir === "asc" ? "currently ascending" : "currently descending") : "not sorted"})`}
      >
        {label}
        <Icon
          className={cn("h-3.5 w-3.5", active ? "opacity-90" : "opacity-40")}
          aria-hidden="true"
        />
      </button>
    </th>
  );
}

export type DirectoryTone =
  | "neutral"
  | "positive"
  | "warning"
  | "critical"
  | "info"
  | "outline";

export function DirectoryTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: DirectoryTone;
}) {
  return (
    <span className={`directory-tag directory-tag--${tone}`}>{children}</span>
  );
}

export function DirectoryStatus({
  status,
}: {
  status: string | null | undefined;
}) {
  const tone =
    status === "Active"
      ? "positive"
      : status === "Negotiation"
        ? "warning"
        : "neutral";
  return <DirectoryTag tone={tone}>{status || "Not set"}</DirectoryTag>;
}
