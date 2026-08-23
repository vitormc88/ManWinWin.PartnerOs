import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { academyErrorMessage } from "@/hooks/useAcademy";
import { signFileUrl } from "@/lib/storage-url";
import { ACADEMY_STORAGE_BUCKET } from "@/lib/academy";
import {
  buildAssetUsageIndex,
  type AcademyAsset,
  type AcademyAssetVersion,
  type AssetUsage,
  type UsageSource,
} from "@/lib/academy-assets";

const QK = {
  assets: ["academy", "assets"] as const,
  versions: ["academy", "asset-versions"] as const,
  usage: ["academy", "asset-usage"] as const,
};

/** Whole library (RLS keeps it Academy-only; viewers get read access). */
export function useAcademyAssets() {
  return useQuery({
    queryKey: QK.assets,
    queryFn: async (): Promise<AcademyAsset[]> => {
      const { data, error } = await supabase
        .from("academy_assets")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AcademyAsset[];
    },
    staleTime: 60_000,
  });
}

export function useAcademyAssetVersions(assetId: string | undefined) {
  return useQuery({
    queryKey: [...QK.versions, assetId ?? "none"],
    enabled: !!assetId,
    queryFn: async (): Promise<AcademyAssetVersion[]> => {
      const { data, error } = await supabase
        .from("academy_asset_versions")
        .select("*")
        .eq("asset_id", assetId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AcademyAssetVersion[];
    },
  });
}

export type AcademyAssetInput = Partial<AcademyAsset> & { id?: string };

/**
 * Creates or updates an asset. Whenever the underlying file/link changes a new
 * immutable version row is written, so "replace once, update everywhere" keeps
 * an auditable history and every referencing mission renders the new file.
 */
export function useSaveAcademyAsset() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: AcademyAssetInput & { changeNotes?: string | null }) => {
      const { id, changeNotes, ...rest } = input;
      const payload = {
        ...rest,
        updated_by: user?.id ?? null,
      } as Record<string, unknown>;

      if (id) {
        const { data: current, error: readError } = await supabase
          .from("academy_assets")
          .select("file_path, external_url, current_version")
          .eq("id", id)
          .maybeSingle();
        if (readError) throw readError;

        const fileChanged =
          (rest.file_path ?? null) !== (current?.file_path ?? null) ||
          (rest.external_url ?? null) !== (current?.external_url ?? null);
        const nextVersion = (current?.current_version ?? 1) + (fileChanged ? 1 : 0);
        if (fileChanged) payload.current_version = nextVersion;

        const { error } = await supabase.from("academy_assets").update(payload as never).eq("id", id);
        if (error) throw error;

        if (fileChanged) {
          await supabase.from("academy_asset_versions").insert({
            asset_id: id,
            version: nextVersion,
            file_path: rest.file_path ?? null,
            external_url: rest.external_url ?? null,
            mime_type: rest.mime_type ?? null,
            file_size: rest.file_size ?? null,
            change_notes: changeNotes ?? null,
            created_by: user?.id ?? null,
          } as never);
        }
        return id;
      }

      const { data, error } = await supabase
        .from("academy_assets")
        .insert({ ...payload, created_by: user?.id ?? null, current_version: 1 } as never)
        .select("id")
        .single();
      if (error) throw error;
      const newId = (data as { id: string }).id;
      await supabase.from("academy_asset_versions").insert({
        asset_id: newId,
        version: 1,
        file_path: rest.file_path ?? null,
        external_url: rest.external_url ?? null,
        mime_type: rest.mime_type ?? null,
        file_size: rest.file_size ?? null,
        change_notes: changeNotes ?? "Initial version",
        created_by: user?.id ?? null,
      } as never);
      return newId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.success("Asset saved");
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not save the asset")),
  });
}

/** Restores a previous version by promoting its file/link to a new version. */
export function useRestoreAssetVersion() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { asset: AcademyAsset; version: AcademyAssetVersion }) => {
      const next = input.asset.current_version + 1;
      const { error } = await supabase
        .from("academy_assets")
        .update({
          file_path: input.version.file_path,
          external_url: input.version.external_url,
          mime_type: input.version.mime_type,
          file_size: input.version.file_size,
          current_version: next,
          updated_by: user?.id ?? null,
        } as never)
        .eq("id", input.asset.id);
      if (error) throw error;
      const { error: vErr } = await supabase.from("academy_asset_versions").insert({
        asset_id: input.asset.id,
        version: next,
        file_path: input.version.file_path,
        external_url: input.version.external_url,
        mime_type: input.version.mime_type,
        file_size: input.version.file_size,
        change_notes: `Restored from v${input.version.version}`,
        created_by: user?.id ?? null,
      } as never);
      if (vErr) throw vErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.success("Version restored");
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not restore the version")),
  });
}

export function useDeleteAcademyAssetRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("academy_assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["academy"] });
      toast.success("Asset deleted");
    },
    onError: (e) => toast.error(academyErrorMessage(e, "Could not delete the asset")),
  });
}

/**
 * Where each asset is embedded, scanned from authored content. Reading the
 * markdown itself keeps usage truthful without a denormalised join table.
 */
export function useAssetUsageIndex() {
  return useQuery({
    queryKey: QK.usage,
    queryFn: async (): Promise<Record<string, AssetUsage[]>> => {
      const [missions, modules, resources, questions] = await Promise.all([
        supabase.from("academy_missions").select("id, title, content_markdown, item_kind"),
        supabase.from("academy_modules").select("id, title, full_description"),
        supabase.from("academy_resources").select("id, title, content"),
        supabase.from("academy_questions").select("id, question_code, explanation"),
      ]);
      const sources: UsageSource[] = [
        ...((missions.data ?? []) as Array<{
          id: string;
          title: string;
          content_markdown: string | null;
          item_kind: string;
        }>).map((m) => ({
          surface:
            m.item_kind === "certification"
              ? ("certification" as const)
              : m.item_kind === "mission"
                ? ("mission" as const)
                : ("lesson" as const),
          recordId: m.id,
          label: m.title,
          markdown: m.content_markdown,
        })),
        ...((modules.data ?? []) as Array<{ id: string; title: string; full_description: string | null }>).map(
          (m) => ({
            surface: "module" as const,
            recordId: m.id,
            label: m.title,
            markdown: m.full_description,
          })
        ),
        ...((resources.data ?? []) as Array<{ id: string; title: string; content: string | null }>).map((r) => ({
          surface: "resource" as const,
          recordId: r.id,
          label: r.title,
          markdown: r.content,
        })),
        ...((questions.data ?? []) as Array<{ id: string; question_code: string; explanation: string | null }>).map(
          (q) => ({
            surface: "question-explanation" as const,
            recordId: q.id,
            label: q.question_code,
            markdown: q.explanation,
          })
        ),
      ];
      return buildAssetUsageIndex(sources);
    },
    staleTime: 60_000,
  });
}

/**
 * Resolves an asset's binary into a short-lived signed URL (private bucket) or
 * returns the external URL untouched. Cached per path for the session.
 */
export function useAssetUrl(asset: AcademyAsset | undefined | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const path = asset?.file_path ?? null;
  const external = asset?.external_url ?? null;
  // Re-sign when the version changes so replacements never serve a stale file.
  const version = asset?.current_version ?? 0;

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(external ?? null);
      return;
    }
    signFileUrl(ACADEMY_STORAGE_BUCKET, path).then((signed) => {
      if (!cancelled) setUrl(signed ?? external ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [path, external, version]);

  return url;
}

/** Published assets only, keyed for the mission renderer. */
export function useAssetsByKey(): { byKey: Record<string, AcademyAsset>; isLoading: boolean } {
  const { data, isLoading } = useAcademyAssets();
  const byKey = useMemo(() => {
    const map: Record<string, AcademyAsset> = {};
    for (const asset of data ?? []) map[asset.asset_key] = asset;
    return map;
  }, [data]);
  return { byKey, isLoading };
}

export interface ResolvedMediaAsset {
  asset: AcademyAsset | null;
  url: string | null;
  /** True only for a published asset with a resolvable binary/link. */
  ready: boolean;
  isLoading: boolean;
}

/**
 * Resolves one optional Asset Library reference for the Mission Player.
 *
 * Only *published* assets resolve — draft, archived, missing or unresolvable
 * keys return `ready: false` so the caller keeps its polished placeholder.
 */
export function useAcademyMediaAsset(assetKey: string | null | undefined): ResolvedMediaAsset {
  const { byKey, isLoading } = useAssetsByKey();
  const candidate = assetKey ? byKey[assetKey] : undefined;
  const asset = candidate && candidate.status === "published" ? candidate : null;
  const url = useAssetUrl(asset);
  return { asset, url, ready: Boolean(asset && url), isLoading: Boolean(assetKey) && isLoading };
}

