import { supabase } from "@/integrations/supabase/client";

type SignFileUrlDebugOptions = {
  context?: string;
  action?: "preview" | "download" | string;
  documentId?: string | null;
};

export type StorageReferenceInfo = {
  isExternal: boolean;
  isSupabaseStorage: boolean;
  extractedBucket: string | null;
  extractedObjectPath: string | null;
  parseError: string | null;
};

export function extractStorageReference(bucket: string, urlOrPath: string): StorageReferenceInfo {
  if (!urlOrPath) {
    return {
      isExternal: false,
      isSupabaseStorage: false,
      extractedBucket: null,
      extractedObjectPath: null,
      parseError: "missing_path",
    };
  }

  const isHttp = /^https?:\/\//i.test(urlOrPath);
  const isSupabaseStorage = urlOrPath.includes("/storage/v1/object/");

  if (isHttp && !isSupabaseStorage) {
    return {
      isExternal: true,
      isSupabaseStorage: false,
      extractedBucket: null,
      extractedObjectPath: null,
      parseError: null,
    };
  }

  let extractedBucket = bucket;
  let extractedObjectPath = urlOrPath;

  if (isSupabaseStorage) {
    const publicMarker = "/storage/v1/object/public/";
    const signMarker = "/storage/v1/object/sign/";
    const tryExtract = (marker: string) => {
      const idx = urlOrPath.indexOf(marker);
      if (idx < 0) return null;
      const rest = urlOrPath.substring(idx + marker.length);
      const slash = rest.indexOf("/");
      if (slash < 0) return null;
      return {
        bucket: rest.substring(0, slash),
        key: rest.substring(slash + 1).split("?")[0],
      };
    };

    const extracted = tryExtract(publicMarker) ?? tryExtract(signMarker);
    if (!extracted) {
      return {
        isExternal: false,
        isSupabaseStorage: true,
        extractedBucket: null,
        extractedObjectPath: null,
        parseError: "could_not_parse_storage_url",
      };
    }

    extractedBucket = extracted.bucket || bucket;
    extractedObjectPath = extracted.key;
  }

  try {
    if (/%[0-9A-Fa-f]{2}/.test(extractedObjectPath)) {
      extractedObjectPath = decodeURIComponent(extractedObjectPath);
    }
  } catch {
    // Leave original path untouched if decoding fails.
  }

  return {
    isExternal: false,
    isSupabaseStorage,
    extractedBucket,
    extractedObjectPath,
    parseError: null,
  };
}

function classifyStorageSignError(error: { code?: string | null; message?: string | null } | null | undefined) {
  const raw = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (
    raw.includes("row-level") ||
    raw.includes("permission") ||
    raw.includes("unauthorized") ||
    raw.includes("not authorized") ||
    raw.includes("access denied") ||
    raw.includes("policy")
  ) {
    return "likely_storage.objects_select_policy_denied";
  }
  if (raw.includes("not found") || raw.includes("no rows") || raw.includes("does not exist")) {
    return "likely_object_not_found";
  }
  return "unknown";
}

/**
 * Resolve a value stored in `file_url` / `docx_url` (which may be either a
 * storage object path or a legacy full public URL) into a short-lived signed
 * URL that works against a private bucket.
 *
 * Returns the original value untouched ONLY for genuinely external URLs (i.e.
 * not Supabase storage). For Supabase storage URLs we always re-sign — never
 * hand back the now-dead `/object/public/...` form.
 */
export async function signFileUrl(
  bucket: string,
  urlOrPath: string,
  expiresInSeconds: number = 60 * 60,
  debugOptions?: SignFileUrlDebugOptions,
): Promise<string | null> {
  if (!urlOrPath) return null;
  const ref = extractStorageReference(bucket, urlOrPath);

  if (debugOptions?.context === "knowledge-base") {
    const { data: { session } } = await supabase.auth.getSession();
    console.info("[KB-DIAG] signFileUrl:start", {
      context: debugOptions.context,
      action: debugOptions.action ?? null,
      documentId: debugOptions.documentId ?? null,
      currentAuthUserId: session?.user?.id ?? null,
      hasSession: !!session,
      extractedBucket: ref.extractedBucket,
      extractedObjectPath: ref.extractedObjectPath,
      parseError: ref.parseError,
      isExternal: ref.isExternal,
      isSupabaseStorage: ref.isSupabaseStorage,
    });
  }

  if (ref.isExternal) return urlOrPath;
  if (ref.parseError || !ref.extractedBucket || !ref.extractedObjectPath) {
    if (debugOptions?.context === "knowledge-base") {
      console.error("[KB-DIAG] signFileUrl:error", {
        context: debugOptions.context,
        action: debugOptions.action ?? null,
        documentId: debugOptions.documentId ?? null,
        success: false,
        extractedBucket: ref.extractedBucket,
        extractedObjectPath: ref.extractedObjectPath,
        storageErrorCode: null,
        storageErrorMessage: ref.parseError,
        likelyCause: ref.parseError === "could_not_parse_storage_url" ? "path_parse_failed" : "unknown",
      });
    } else {
      console.warn("[signFileUrl] could not parse storage URL:", urlOrPath);
    }
    return null;
  }

  const { data, error } = await supabase.storage
    .from(ref.extractedBucket)
    .createSignedUrl(ref.extractedObjectPath, expiresInSeconds);

  if (error || !data) {
    const storageError = error as { code?: string | null; message?: string | null } | null;
    if (debugOptions?.context === "knowledge-base") {
      console.error("[KB-DIAG] signFileUrl:error", {
        context: debugOptions.context,
        action: debugOptions.action ?? null,
        documentId: debugOptions.documentId ?? null,
        success: false,
        extractedBucket: ref.extractedBucket,
        extractedObjectPath: ref.extractedObjectPath,
        storageErrorCode: storageError?.code ?? null,
        storageErrorMessage: storageError?.message ?? null,
        likelyCause: classifyStorageSignError(storageError),
      });
    } else {
      console.error("[signFileUrl] createSignedUrl failed", {
        bucket: ref.extractedBucket,
        path: ref.extractedObjectPath,
        error: storageError,
      });
    }
    return null;
  }

  if (debugOptions?.context === "knowledge-base") {
    console.info("[KB-DIAG] signFileUrl:result", {
      context: debugOptions.context,
      action: debugOptions.action ?? null,
      documentId: debugOptions.documentId ?? null,
      success: true,
      extractedBucket: ref.extractedBucket,
      extractedObjectPath: ref.extractedObjectPath,
    });
  }

  return data.signedUrl;
}
