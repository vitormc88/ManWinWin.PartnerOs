/**
 * How a learner can consume an Academy resource.
 *
 * Resources are one of three things, and the UI must never promise more than
 * the row actually holds:
 *  - `external`  — a safe external URL, opened in a new tab;
 *  - `file`      — an object stored in the private bucket, opened via a signed URL;
 *  - `content`   — authored Markdown with no attachment: read in-app and printed
 *                  (Print / Save as PDF) instead of downloaded;
 *  - `unavailable` — nothing to open yet.
 */
import { isSafeExternalUrl, type AcademyResource } from "@/lib/academy";

export type ResourceMode = "external" | "file" | "content" | "unavailable";

export interface ResourceAction {
  mode: ResourceMode;
  /** Button label; empty when there is nothing to open. */
  label: string;
  /** Resolved external URL, when the mode is `external`. */
  href?: string;
  /** True only when a real file exists and the row allows downloading it. */
  download: boolean;
}

type ResourceLike = Pick<
  AcademyResource,
  "file_path" | "external_url" | "content" | "is_downloadable"
>;

export function resourceAction(resource: ResourceLike): ResourceAction {
  const href = isSafeExternalUrl(resource.external_url) ? resource.external_url! : null;
  if (href) return { mode: "external", label: "Open", href, download: false };

  const path = (resource.file_path ?? "").trim();
  if (path) {
    const download = resource.is_downloadable === true;
    return { mode: "file", label: download ? "Download" : "Open", download };
  }

  // Content-only: never show a download affordance we cannot honour.
  if ((resource.content ?? "").trim()) {
    return { mode: "content", label: "Read & print", download: false };
  }

  return { mode: "unavailable", label: "", download: false };
}

/** Content-only resources are read in-app; everything else keeps file behaviour. */
export function isContentOnlyResource(resource: ResourceLike): boolean {
  return resourceAction(resource).mode === "content";
}
