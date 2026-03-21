import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;

const mapError = (error: unknown, action: string) => {
  const msg = error instanceof Error ? error.message : "";
  if (msg.toLowerCase().includes("row-level security") || msg.toLowerCase().includes("permission denied")) {
    return new Error(`You do not have permission to ${action}. This action is restricted to HQ administrators.`);
  }
  return error instanceof Error ? error : new Error(`Failed to ${action}`);
};

export function useClients(filters?: { partner_id?: string; status?: string }) {
  return useQuery({
    queryKey: ["clients", filters],
    queryFn: async () => {
      let query = supabase.from("clients").select("*").order("commercial_name");
      if (filters?.partner_id) query = query.eq("partner_id", filters.partner_id);
      if (filters?.status) query = query.eq("status", filters.status);
      const { data, error } = await query;
      if (error) throw error;
      return data as Client[];
    },
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: TablesInsert<"clients">) => {
      const { data, error } = await supabase.from("clients").insert(client).select().single();
      if (error) throw mapError(error, "create client");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesUpdate<"clients">>) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw mapError(error, "update client");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", data.id] });
    },
  });
}

export function useArchiveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("clients").update({ status: "Archived", is_inactive: true }).eq("id", id).select().single();
      if (error) throw mapError(error, "archive client");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useRestoreClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from("clients").update({ status: "Active", is_inactive: false }).eq("id", id).select().single();
      if (error) throw mapError(error, "restore client");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Contacts
export function useClientContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client_contacts", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.from("client_contacts").select("*").eq("client_id", clientId);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contact: TablesInsert<"client_contacts">) => {
      const { data, error } = await supabase.from("client_contacts").insert(contact).select().single();
      if (error) throw mapError(error, "create contact");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", data.client_id] });
    },
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; client_id?: string } & Partial<TablesUpdate<"client_contacts">>) => {
      const { data, error } = await supabase.from("client_contacts").update(updates).eq("id", id).select().single();
      if (error) throw mapError(error, "update contact");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", data.client_id] });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, clientId }: { id: string; clientId: string }) => {
      const { error } = await supabase.from("client_contacts").delete().eq("id", id);
      if (error) throw mapError(error, "delete contact");
      return clientId;
    },
    onSuccess: (clientId) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] });
    },
  });
}

// Licenses
export function useClientLicenses(clientId: string | undefined) {
  return useQuery({
    queryKey: ["licenses", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.from("licenses").select("*").eq("client_id", clientId);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useCreateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (license: TablesInsert<"licenses">) => {
      const { data, error } = await supabase.from("licenses").insert(license).select().single();
      if (error) throw mapError(error, "create license");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["licenses", data.client_id] });
    },
  });
}

export function useUpdateLicense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesUpdate<"licenses">>) => {
      const { data, error } = await supabase.from("licenses").update(updates).eq("id", id).select().single();
      if (error) throw mapError(error, "update license");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["licenses", data.client_id] });
    },
  });
}

// Contracts
export function useClientContracts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["contracts", clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase.from("contracts").select("*").eq("client_id", clientId);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contract: TablesInsert<"contracts">) => {
      const { data, error } = await supabase.from("contracts").insert(contract).select().single();
      if (error) throw mapError(error, "create contract");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contracts", data.client_id] });
    },
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesUpdate<"contracts">>) => {
      const { data, error } = await supabase.from("contracts").update(updates).eq("id", id).select().single();
      if (error) throw mapError(error, "update contract");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["contracts", data.client_id] });
    },
  });
}

// Notes
export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: TablesInsert<"client_notes">) => {
      const { data, error } = await supabase.from("client_notes").insert(note).select().single();
      if (error) throw mapError(error, "create note");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client_notes", data.client_id] });
    },
  });
}

// Credentials
export function useCreateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cred: TablesInsert<"client_credentials">) => {
      const { data, error } = await supabase.from("client_credentials").insert(cred).select().single();
      if (error) throw mapError(error, "create credential");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client_credentials", data.client_id] });
    },
  });
}

export function useUpdateCredential() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<TablesUpdate<"client_credentials">>) => {
      const { data, error } = await supabase.from("client_credentials").update(updates).eq("id", id).select().single();
      if (error) throw mapError(error, "update credential");
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["client_credentials", data.client_id] });
    },
  });
}
