-- FIN02 TEST-only financial column overlay on the PROD structural baseline.
-- This is strictly source-verified metadata, not a deployment migration.
-- After this overlay, column names/types/defaults/nullability match TEST (order may vary).

ALTER TABLE public."deals" ADD COLUMN "source_system" text;
ALTER TABLE public."deals" ADD COLUMN "external_opportunity_id" text;
ALTER TABLE public."deals" ADD COLUMN "external_stage_id" text;
ALTER TABLE public."deals" ADD COLUMN "external_stage_name" text;
ALTER TABLE public."deals" ADD COLUMN "source_owner_id" text;
ALTER TABLE public."deals" ADD COLUMN "source_updated_at" timestamp with time zone;
ALTER TABLE public."deals" ADD COLUMN "source_synced_at" timestamp with time zone;
ALTER TABLE public."deals" ADD COLUMN "sync_read_only" boolean DEFAULT false NOT NULL;
ALTER TABLE public."renewals" DROP COLUMN "superseded_by_renewal_id";
ALTER TABLE public."clients" ADD CONSTRAINT "clients_source_proposal_id_fkey" FOREIGN KEY (source_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE public."contract_lines" ADD CONSTRAINT "contract_lines_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public."contract_lines" ADD CONSTRAINT "contract_lines_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE public."contract_lines" ADD CONSTRAINT "contract_lines_related_license_id_fkey" FOREIGN KEY (related_license_id) REFERENCES licenses(id) ON DELETE SET NULL;
ALTER TABLE public."contracts" ADD CONSTRAINT "contracts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public."contracts" ADD CONSTRAINT "contracts_source_proposal_id_fkey" FOREIGN KEY (source_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE public."licenses" ADD CONSTRAINT "licenses_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public."licenses" ADD CONSTRAINT "licenses_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE public."licenses" ADD CONSTRAINT "licenses_previous_license_id_fkey" FOREIGN KEY (previous_license_id) REFERENCES licenses(id) ON DELETE SET NULL;
ALTER TABLE public."licenses" ADD CONSTRAINT "licenses_replaced_by_license_id_fkey" FOREIGN KEY (replaced_by_license_id) REFERENCES licenses(id) ON DELETE SET NULL;
ALTER TABLE public."proposal_items" ADD CONSTRAINT "proposal_items_proposal_id_fkey" FOREIGN KEY (proposal_id) REFERENCES proposals(id) ON DELETE CASCADE;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_parent_proposal_id_fkey" FOREIGN KEY (parent_proposal_id) REFERENCES proposals(id) ON DELETE SET NULL;
ALTER TABLE public."proposals" ADD CONSTRAINT "proposals_renewal_id_fkey" FOREIGN KEY (renewal_id) REFERENCES renewals(id) ON DELETE RESTRICT;
ALTER TABLE public."renewals" ADD CONSTRAINT "renewals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
ALTER TABLE public."renewals" ADD CONSTRAINT "renewals_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE public."renewals" ADD CONSTRAINT "renewals_covered_by_contract_id_fkey" FOREIGN KEY (covered_by_contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE public."renewals" ADD CONSTRAINT "renewals_license_id_fkey" FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE SET NULL;
ALTER TABLE public."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contract_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."deals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."licenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposal_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."renewals" ENABLE ROW LEVEL SECURITY;

-- Intentionally omitted external FKs to parent tables absent from narrow laboratory:
-- clients.clients_account_manager_id_fkey => FOREIGN KEY (account_manager_id) REFERENCES profiles(id) ON DELETE SET NULL
-- clients.clients_manager_owner_id_fkey => FOREIGN KEY (manager_owner_id) REFERENCES profiles(id) ON DELETE SET NULL
-- clients.clients_partner_uuid_fkey => FOREIGN KEY (partner_uuid) REFERENCES partners(id) ON DELETE SET NULL
-- contract_lines.contract_lines_related_module_id_fkey => FOREIGN KEY (related_module_id) REFERENCES modules_catalog(id) ON DELETE SET NULL
-- contract_lines.contract_lines_related_plugin_id_fkey => FOREIGN KEY (related_plugin_id) REFERENCES plugins_catalog(id) ON DELETE SET NULL
-- deals.deals_assigned_user_id_fkey => FOREIGN KEY (assigned_user_id) REFERENCES profiles(id) ON DELETE SET NULL
-- proposals.proposals_implementation_transition_rule_id_fkey => FOREIGN KEY (implementation_transition_rule_id) REFERENCES plan_transition_rules(id)
-- proposals.proposals_partner_uuid_fkey => FOREIGN KEY (partner_uuid) REFERENCES partners(id) ON DELETE SET NULL
-- renewals.renewals_assigned_user_id_fkey => FOREIGN KEY (assigned_user_id) REFERENCES profiles(id) ON DELETE SET NULL
-- renewals.renewals_partner_uuid_fkey => FOREIGN KEY (partner_uuid) REFERENCES partners(id) ON DELETE SET NULL
