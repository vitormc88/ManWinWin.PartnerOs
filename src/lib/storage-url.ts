import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a value stored in `file_url` / `docx_url` (which may be either a
 * storage object path or a legacy full public URL) into a short-lived signed
 * URL that works against a private bucket.
 *
 * Returns the original value untouched for external (non-Supabase) URLs so
 * "link" type knowledge-base entries continue to work.
 */
export async function signFileUrl(
  bucket: string,
  urlOrPath: string,
  expiresInSeconds: number = 60 * 60,
): Promise<string | null> {
  if (!urlOrPath) return null;
  // External link — leave alone.
  if (/^https?:\/\//i.test(urlOrPath) && !urlOrPath.includes("/storage/v1/object/")) {
    return urlOrPath;
  }
  let path = urlOrPath;
  // Extract the path from a legacy public URL like
  // https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = path.indexOf(marker);
  if (idx >= 0) {
    path = path.substring(idx + marker.length);
  } else {
    const signedMarker = `/storage/v1/object/sign/${bucket}/`;
    const sidx = path.indexOf(signedMarker);
    if (sidx >= 0) path = path.substring(sidx + signedMarker.length).split("?")[0];
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}
