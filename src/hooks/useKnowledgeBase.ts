import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useCategories() {
  return useQuery({
    queryKey: ["document_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_categories")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useDocuments(categoryId?: string | null) {
  return useQuery({
    queryKey: ["documents", categoryId],
    queryFn: async () => {
      let q = supabase
        .from("documents")
        .select("*, document_categories(name)")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (categoryId) q = q.eq("category_id", categoryId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string; icon?: string; parent_category_id?: string | null; sort_order?: number }) => {
      const { data, error } = await supabase.from("document_categories").insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document_categories"] }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; description?: string; icon?: string; sort_order?: number; parent_category_id?: string | null }) => {
      const { error } = await supabase.from("document_categories").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document_categories"] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("document_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["document_categories"] }),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      title: string;
      description?: string;
      category_id?: string;
      file_url?: string;
      file_name?: string;
      file_type?: string;
      file_size_bytes?: number;
      visibility_scope?: string;
      partner_id?: string;
      tags?: string[];
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("documents")
        .insert({ ...values, uploaded_by: userData.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; title?: string; description?: string; category_id?: string; file_url?: string; visibility_scope?: string; tags?: string[]; is_active?: boolean }) => {
      const { error } = await supabase.from("documents").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}
