import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const COMMUNITY_CATEGORIES = [
  "Sales",
  "Product",
  "Implementation",
  "Integrations",
  "Marketing",
  "Feedback",
  "General",
] as const;

export type CommunityStatus = "open" | "answered" | "closed";

export type CommunityPost = {
  id: string;
  title: string;
  body: string | null;
  category: string;
  status: CommunityStatus;
  pinned: boolean;
  created_by: string | null;
  partner_id: string | null;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
  closed_at: string | null;
};

export type CommunityComment = {
  id: string;
  post_id: string;
  body: string;
  created_by: string | null;
  is_official_hq_reply: boolean;
  created_at: string;
  updated_at: string;
};

export type CommunityPostWithMeta = CommunityPost & {
  author_name: string | null;
  partner_name: string | null;
  comment_count: number;
};

async function enrichPosts(posts: CommunityPost[]): Promise<CommunityPostWithMeta[]> {
  if (posts.length === 0) return [];
  const userIds = Array.from(new Set(posts.map(p => p.created_by).filter(Boolean))) as string[];
  const partnerIds = Array.from(new Set(posts.map(p => p.partner_id).filter(Boolean))) as string[];

  const [profilesRes, partnersRes, countsRes] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name, email").in("id", userIds)
      : Promise.resolve({ data: [], error: null } as any),
    partnerIds.length
      ? supabase.from("partners").select("id, company_name").in("id", partnerIds)
      : Promise.resolve({ data: [], error: null } as any),
    supabase.from("community_comments").select("post_id").in("post_id", posts.map(p => p.id)),
  ]);

  const nameMap: Record<string, string> = {};
  (profilesRes.data ?? []).forEach((p: any) => {
    nameMap[p.id] = p.full_name || p.email || "Unknown";
  });
  const partnerMap: Record<string, string> = {};
  (partnersRes.data ?? []).forEach((p: any) => {
    partnerMap[p.id] = p.company_name;
  });
  const countMap: Record<string, number> = {};
  (countsRes.data ?? []).forEach((c: any) => {
    countMap[c.post_id] = (countMap[c.post_id] ?? 0) + 1;
  });

  return posts.map(p => ({
    ...p,
    author_name: p.created_by ? nameMap[p.created_by] ?? null : null,
    partner_name: p.partner_id ? partnerMap[p.partner_id] ?? null : null,
    comment_count: countMap[p.id] ?? 0,
  }));
}

export function useCommunityPosts() {
  return useQuery({
    queryKey: ["community-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return enrichPosts((data ?? []) as CommunityPost[]);
    },
  });
}

export function useCommunityPost(id: string | null | undefined) {
  return useQuery({
    queryKey: ["community-post", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as CommunityPost | null;
    },
  });
}

export function useCommunityComments(postId: string | null | undefined) {
  return useQuery({
    queryKey: ["community-comments", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_comments")
        .select("*")
        .eq("post_id", postId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const comments = (data ?? []) as CommunityComment[];
      const userIds = Array.from(new Set(comments.map(c => c.created_by).filter(Boolean))) as string[];
      const nameMap: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        (profs ?? []).forEach((p: any) => {
          nameMap[p.id] = p.full_name || p.email || "Unknown";
        });
      }
      return comments.map(c => ({
        ...c,
        author_name: c.created_by ? nameMap[c.created_by] ?? null : null,
      }));
    },
  });
}

export type CommunityPostInput = {
  title: string;
  body?: string | null;
  category: string;
};

export function useSavePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: CommunityPostInput }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (id) {
        const { error } = await supabase
          .from("community_posts")
          .update({
            title: input.title,
            body: input.body ?? null,
            category: input.category,
          })
          .eq("id", id);
        if (error) throw error;
        return id;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("partner_id")
        .eq("id", user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          title: input.title,
          body: input.body ?? null,
          category: input.category,
          status: "open",
          pinned: false,
          created_by: user.id,
          partner_id: profile?.partner_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-post"] });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("community_posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community-posts"] }),
  });
}

export function useUpdatePostMeta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<CommunityPost, "pinned" | "status">>;
    }) => {
      const update: any = { ...patch };
      if (patch.status === "answered") update.answered_at = new Date().toISOString();
      if (patch.status === "closed") update.closed_at = new Date().toISOString();
      if (patch.status === "open") {
        update.answered_at = null;
        update.closed_at = null;
      }
      const { error } = await supabase.from("community_posts").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["community-posts"] });
      qc.invalidateQueries({ queryKey: ["community-post"] });
    },
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      body,
      isHQ,
    }: {
      postId: string;
      body: string;
      isHQ: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("community_comments").insert({
        post_id: postId,
        body,
        created_by: user.id,
        is_official_hq_reply: isHQ,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["community-comments", vars.postId] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; postId: string }) => {
      const { error } = await supabase.from("community_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["community-comments", vars.postId] });
      qc.invalidateQueries({ queryKey: ["community-posts"] });
    },
  });
}
