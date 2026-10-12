-- Disposable PostgreSQL fixture: only the contracts/proposal objects needed to
-- execute the FIN02 migration, not a copy of TEST or production client records.
-- Generic signatures and mutation hooks mirror the actual TEST functions as
-- checked read-only on 2026-10-11. These functions are inert stubs.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE public.proposals (
  id uuid PRIMARY KEY, product_family text, proposal_mode text, version integer,
  total_year_1 numeric, total_recurring numeric, discount_amount numeric
);
CREATE TABLE public.proposal_items (
  id uuid PRIMARY KEY, proposal_id uuid REFERENCES public.proposals(id),
  item_code text, item_name text, pricing_rule_code text, qty numeric,
  unit_price numeric, frequency text, gross_total numeric, discount_amount numeric,
  net_total numeric, discount_type text, discount_value numeric,
  is_recurring boolean NOT NULL, apply_discount_to_renewal boolean NOT NULL
);
CREATE TABLE public.contract_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL,
  client_id uuid NOT NULL, amount numeric NOT NULL,
  source text NOT NULL DEFAULT 'legacy', source_item_id uuid,
  billing_frequency text, description text, line_type text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
-- This surrogate function only tests patched SQL compilation/guard injection.
-- It does NOT emulate all authorization, locks, clients, or RLS of live TEST.
CREATE OR REPLACE FUNCTION public.award_deal_proposal(
 _deal_id uuid, _proposal_id uuid, _existing_client_id uuid, _license jsonb,
 _contract_lines jsonb, _start_date date DEFAULT CURRENT_DATE,
 _notice_days integer DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _start_date IS NULL OR _notice_days NOT BETWEEN 0 AND 365 THEN
    RAISE EXCEPTION 'INVALID_CONTRACT_PERIOD';
  END IF;
  RETURN jsonb_build_object('guard_executed', true);
END;
$function$;
REVOKE ALL ON FUNCTION public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_deal_proposal(uuid,uuid,uuid,jsonb,jsonb,date,integer) TO authenticated;

-- Surrogate close_core shaped like its real TEST aggregations. The four
-- sum(amount) FILTER blocks must have identical indentation to live code.
CREATE OR REPLACE FUNCTION public.close_renewal_core(
 _renewal_id uuid, _outcome text, _proposal_id uuid DEFAULT NULL,
 _closing_notes text DEFAULT NULL, _loss_reason text DEFAULT NULL,
 _effective_date date DEFAULT NULL, _next_renewal_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  p public.proposals%ROWTYPE;
  _prev_recurring numeric := 0;
  _recurring_total numeric := 0;
  _unrelated_recurring numeric := 0;
  _applied_one_time numeric := 0;
  _new_recurring numeric := 0;
  _one_time numeric := 0;
BEGIN
  SELECT * INTO p FROM public.proposals WHERE id = _proposal_id;
  -- ── Renewed ────────────────────────────────────────────────────────────────
  SELECT coalesce(sum(amount) FILTER (
           WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')), 0)
    INTO _prev_recurring FROM public.contract_lines;
  _new_recurring := coalesce(p.total_recurring, 0);
  _one_time := greatest(coalesce(p.total_year_1,0) - _new_recurring, 0);
  SELECT
    coalesce(sum(amount) FILTER (
      WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')), 0),
    coalesce(sum(amount) FILTER (
      WHERE lower(coalesce(billing_frequency,'annual')) NOT IN ('one_time','one-time','once')
        AND line_type='other'), 0),
    coalesce(sum(amount) FILTER (
      WHERE lower(coalesce(billing_frequency,'annual')) IN ('one_time','one-time','once')), 0)
    INTO _recurring_total, _unrelated_recurring, _applied_one_time
  FROM public.contract_lines;
  RETURN jsonb_build_object('previous_recurring',_prev_recurring,
    'next_cycle',_recurring_total,'historical_one_time',_one_time,
    'actual_one_time',_applied_one_time);
END;
$function$;
