CREATE OR REPLACE FUNCTION public.get_client_commercial_intelligence(client_uuid uuid)
 RETURNS TABLE(client_id uuid, partner_id uuid, client_name text, partner_name text, country text, sector text, active_license_count integer, active_contract_count integer, active_renewal_count integer, year1_value numeric, recurring_arr numeric, one_time_value numeric, next_renewal_date date, next_renewal_value numeric, days_to_renewal integer, has_license boolean, has_contract boolean, has_active_renewal boolean, license_family text, license_variant text, deployment_type text, backoffice_users integer, web_users integer, api_access boolean, sat_active boolean, active_modules jsonb, active_plugins jsonb, recurring_items jsonb, one_time_items jsonb, not_renewed_items jsonb, missing_modules jsonb, missing_plugins jsonb, proposed_not_purchased jsonb, upsell_opportunities jsonb, risk_signals jsonb, recommended_actions jsonb, commercial_score integer, expansion_potential numeric, high_confidence_potential numeric, medium_confidence_potential numeric, low_confidence_potential numeric, renewal_risk text, confidence text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  c_row record;
  lic record;
  ren record;
  v_active_modules jsonb := '[]'::jsonb;
  v_active_plugins jsonb := '[]'::jsonb;
  v_recurring_items jsonb := '[]'::jsonb;
  v_one_time_items jsonb := '[]'::jsonb;
  v_proposed_not_purchased jsonb := '[]'::jsonb;
  v_missing_modules jsonb := '[]'::jsonb;
  v_missing_plugins jsonb := '[]'::jsonb;
  v_upsell jsonb := '[]'::jsonb;
  v_risk jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_not_renewed jsonb := '[]'::jsonb;
  v_year1 numeric := 0;
  v_recurring numeric := 0;
  v_one_time numeric := 0;
  v_lic_count int := 0;
  v_con_count int := 0;
  v_ren_count int := 0;
  v_score int := 0;
  v_confidence text := 'low';
  v_renewal_risk text := 'unknown';
  v_high numeric := 0;
  v_med numeric := 0;
  v_low numeric := 0;
  v_days int;
  v_partner_uuid uuid;
  v_partner_name text;
  v_has_lines boolean;
BEGIN
  SELECT cl.* INTO c_row FROM public.clients cl WHERE cl.id = client_uuid;
  IF c_row.id IS NULL THEN RETURN; END IF;

  BEGIN
    v_partner_uuid := nullif(c_row.partner_id, '')::uuid;
  EXCEPTION WHEN others THEN
    v_partner_uuid := NULL;
  END;

  IF v_partner_uuid IS NOT NULL THEN
    SELECT company_name INTO v_partner_name FROM public.partners WHERE id = v_partner_uuid;
  END IF;

  SELECT count(*) INTO v_lic_count FROM public.licenses
    WHERE licenses.client_id = client_uuid AND coalesce(license_status,'active') = 'active';
  SELECT count(*) INTO v_con_count FROM public.contracts
    WHERE contracts.client_id = client_uuid;
  SELECT count(*) INTO v_ren_count FROM public.renewals
    WHERE renewals.client_id = client_uuid AND status NOT IN ('Completed','Cancelled','Lost');

  SELECT * INTO lic FROM public.licenses
    WHERE licenses.client_id = client_uuid AND coalesce(license_status,'active') = 'active'
    ORDER BY license_start_date DESC NULLS LAST LIMIT 1;

  SELECT * INTO ren FROM public.renewals
    WHERE renewals.client_id = client_uuid
      AND renewal_date IS NOT NULL
      AND status NOT IN ('Completed','Cancelled','Lost')
    ORDER BY renewal_date ASC LIMIT 1;

  v_days := CASE WHEN ren.renewal_date IS NOT NULL THEN (ren.renewal_date - current_date) END;

  SELECT
    coalesce(sum(CASE WHEN cl.billing_frequency IN ('yearly','monthly','per-user-month','annual') THEN cl.amount ELSE 0 END),0),
    coalesce(sum(CASE WHEN cl.billing_frequency IS NULL OR cl.billing_frequency IN ('one-time','one_time') THEN cl.amount ELSE 0 END),0)
  INTO v_recurring, v_one_time
  FROM public.contract_lines cl WHERE cl.client_id = client_uuid;

  v_year1 := v_recurring + v_one_time;
  v_has_lines := EXISTS (SELECT 1 FROM public.contract_lines WHERE contract_lines.client_id = client_uuid);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', cl.id, 'description', cl.description, 'type', cl.line_type,
    'amount', cl.amount, 'billing_frequency', cl.billing_frequency
  )), '[]'::jsonb) INTO v_recurring_items
  FROM public.contract_lines cl
  WHERE cl.client_id = client_uuid
    AND cl.billing_frequency IN ('yearly','monthly','per-user-month','annual');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', cl.id, 'description', cl.description, 'type', cl.line_type, 'amount', cl.amount
  )), '[]'::jsonb) INTO v_one_time_items
  FROM public.contract_lines cl
  WHERE cl.client_id = client_uuid
    AND (cl.billing_frequency IS NULL OR cl.billing_frequency IN ('one-time','one_time'));

  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
    'id', coalesce(lm.module_id::text, lm.module_name),
    'name', coalesce(mc.name, lm.module_name),
    'code', mc.code,
    'category', mc.category
  )), '[]'::jsonb) INTO v_active_modules
  FROM public.licensed_modules lm
  LEFT JOIN public.modules_catalog mc ON mc.id = lm.module_id
  JOIN public.licenses l ON l.id = lm.license_id
  WHERE l.client_id = client_uuid AND lm.enabled
    AND (lm.plugin_id IS NULL);

  SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object(
    'id', lm.plugin_id::text, 'name', pc.name, 'code', pc.code, 'category', pc.category
  )), '[]'::jsonb) INTO v_active_plugins
  FROM public.licensed_modules lm
  JOIN public.plugins_catalog pc ON pc.id = lm.plugin_id
  JOIN public.licenses l ON l.id = lm.license_id
  WHERE l.client_id = client_uuid AND lm.enabled;

  WITH client_proposals AS (
    SELECT DISTINCT pid FROM (
      SELECT source_proposal_id AS pid FROM public.contracts WHERE contracts.client_id = client_uuid AND source_proposal_id IS NOT NULL
      UNION
      SELECT source_proposal_id FROM public.licenses WHERE licenses.client_id = client_uuid AND source_proposal_id IS NOT NULL
      UNION
      SELECT source_proposal_id FROM public.renewals WHERE renewals.client_id = client_uuid AND source_proposal_id IS NOT NULL
    ) u WHERE pid IS NOT NULL
  ),
  proposed AS (
    SELECT pi.id, pi.item_code, pi.item_name, pi.category, pi.total, pi.is_recurring
    FROM public.proposal_items pi
    JOIN client_proposals cp ON cp.pid = pi.proposal_id
  ),
  matched AS (
    SELECT lower(coalesce(cl.description,'')) AS d FROM public.contract_lines cl WHERE cl.client_id = client_uuid
    UNION
    SELECT lower(coalesce(lm.module_name,'')) FROM public.licensed_modules lm JOIN public.licenses l ON l.id = lm.license_id WHERE l.client_id = client_uuid
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'item', p.item_name,
    'code', p.item_code,
    'category', p.category,
    'reason', 'Included in proposal but not present in active contract',
    'estimated_arr', CASE WHEN p.is_recurring THEN p.total ELSE 0 END,
    'confidence', 'medium',
    'recommended_action', 'Revisit ' || p.item_name || ' during next renewal conversation'
  )), '[]'::jsonb) INTO v_proposed_not_purchased
  FROM proposed p
  WHERE NOT EXISTS (SELECT 1 FROM matched m WHERE m.d = lower(p.item_name));

  WITH have AS (
    SELECT lower(coalesce(mc.name, lm.module_name)) AS n
    FROM public.licensed_modules lm
    LEFT JOIN public.modules_catalog mc ON mc.id = lm.module_id
    JOIN public.licenses l ON l.id = lm.license_id
    WHERE l.client_id = client_uuid AND lm.enabled
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', mc.id, 'name', mc.name, 'code', mc.code, 'category', mc.category
  )), '[]'::jsonb) INTO v_missing_modules
  FROM public.modules_catalog mc
  WHERE mc.is_active AND lower(mc.name) NOT IN (SELECT n FROM have WHERE n IS NOT NULL);

  WITH have AS (
    SELECT lower(coalesce(pc.name,'')) AS n
    FROM public.licensed_modules lm
    JOIN public.plugins_catalog pc ON pc.id = lm.plugin_id
    JOIN public.licenses l ON l.id = lm.license_id
    WHERE l.client_id = client_uuid AND lm.enabled
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', pc.id, 'name', pc.name, 'code', pc.code, 'category', pc.category
  )), '[]'::jsonb) INTO v_missing_plugins
  FROM public.plugins_catalog pc
  WHERE pc.is_active AND lower(pc.name) NOT IN (SELECT n FROM have WHERE n IS NOT NULL);

  v_upsell := v_upsell || coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', gen_random_uuid(),
      'type', 'proposal_reactivation',
      'title', 'Revisit ' || (item->>'item'),
      'description', 'Previously proposed but not purchased.',
      'reason', item->>'reason',
      'estimated_arr', coalesce((item->>'estimated_arr')::numeric, 0),
      'confidence', item->>'confidence',
      'priority', 'high',
      'source', 'proposal',
      'related_item', item->>'item',
      'recommended_action', item->>'recommended_action'
    ))
    FROM jsonb_array_elements(v_proposed_not_purchased) AS item
  ), '[]'::jsonb);

  IF lic.id IS NOT NULL AND coalesce(lic.sat_active,false) = false AND v_recurring > 0 THEN
    v_upsell := v_upsell || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'type', 'sat_attach',
      'title', 'Attach Support & Assistance (S&AT)',
      'description', 'Recurring license without active S&AT.',
      'reason', 'Recurring license without S&AT',
      'estimated_arr', round(v_recurring * 0.18, 2),
      'confidence', 'medium',
      'priority', 'medium',
      'source', 'license',
      'related_item', 'S&AT',
      'recommended_action', 'Quote S&AT at the next renewal cycle'
    ));
  END IF;

  IF lic.id IS NOT NULL AND coalesce(lic.api_access,false) = false THEN
    v_upsell := v_upsell || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(),
      'type', 'api_enablement',
      'title', 'Enable API access',
      'description', 'API is currently disabled for this client.',
      'reason', 'No API access enabled',
      'estimated_arr', 0,
      'confidence', 'low',
      'priority', 'low',
      'source', 'license',
      'related_item', 'API',
      'recommended_action', 'Discuss integration use cases'
    ));
  END IF;

  SELECT
    coalesce(sum(CASE WHEN op->>'confidence' = 'high' THEN (op->>'estimated_arr')::numeric ELSE 0 END),0),
    coalesce(sum(CASE WHEN op->>'confidence' = 'medium' THEN (op->>'estimated_arr')::numeric ELSE 0 END),0),
    coalesce(sum(CASE WHEN op->>'confidence' = 'low' THEN (op->>'estimated_arr')::numeric ELSE 0 END),0)
  INTO v_high, v_med, v_low
  FROM jsonb_array_elements(v_upsell) AS op;

  IF v_con_count = 0 THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','no_contract','severity','high','message','No contract on file'));
  END IF;
  IF v_ren_count = 0 AND v_lic_count > 0 THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','no_renewal','severity','high','message','Active license without renewal'));
  END IF;
  IF ren.renewal_date IS NOT NULL AND ren.renewal_date < current_date THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','renewal_overdue','severity','high','message','Renewal overdue'));
  END IF;
  IF v_con_count > 0 AND NOT v_has_lines THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','contract_no_lines','severity','medium','message','Contract exists but has no lines'));
  END IF;
  IF lic.id IS NOT NULL AND coalesce(lic.sat_active,false) = false THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','no_sat','severity','medium','message','No active S&AT'));
  END IF;

  IF ren.renewal_date IS NOT NULL AND ren.renewal_date < current_date THEN
    v_renewal_risk := 'high';
  ELSIF ren.id IS NULL AND v_lic_count > 0 THEN
    v_renewal_risk := 'high';
  ELSIF v_days IS NOT NULL AND v_days <= 30 AND ren.assigned_user_id IS NULL THEN
    v_renewal_risk := 'high';
  ELSIF v_days IS NOT NULL AND v_days <= 90 THEN
    v_renewal_risk := 'medium';
  ELSIF ren.renewal_date IS NOT NULL AND v_recurring > 0 THEN
    v_renewal_risk := 'low';
  ELSE
    v_renewal_risk := 'unknown';
  END IF;

  v_score := 0;
  IF v_con_count > 0 THEN v_score := v_score + 15; END IF;
  IF v_lic_count > 0 THEN v_score := v_score + 15; END IF;
  IF v_recurring > 0 THEN v_score := v_score + 15; END IF;
  IF ren.id IS NOT NULL THEN v_score := v_score + 10; END IF;
  IF jsonb_array_length(v_active_modules) + jsonb_array_length(v_active_plugins) >= 2 THEN v_score := v_score + 10; END IF;
  IF lic.id IS NOT NULL AND lic.api_access THEN v_score := v_score + 5; END IF;
  IF lic.id IS NOT NULL AND lic.sat_active THEN v_score := v_score + 10; END IF;
  IF EXISTS (SELECT 1 FROM public.lifecycle_events le WHERE le.client_id = client_uuid) THEN v_score := v_score + 10; END IF;
  IF EXISTS (SELECT 1 FROM public.contracts ct WHERE ct.client_id = client_uuid AND ct.source_proposal_id IS NOT NULL) THEN v_score := v_score + 10; END IF;
  IF ren.renewal_date IS NOT NULL AND ren.renewal_date < current_date THEN v_score := v_score - 20; END IF;
  IF v_con_count > 0 AND v_year1 = 0 THEN v_score := v_score - 10; END IF;
  v_score := greatest(0, least(100, v_score));

  IF v_con_count > 0 AND ren.id IS NOT NULL AND v_lic_count > 0 AND v_has_lines THEN
    v_confidence := 'high';
  ELSIF v_lic_count > 0 OR v_con_count > 0 THEN
    v_confidence := 'medium';
  ELSE
    v_confidence := 'low';
  END IF;

  IF v_renewal_risk = 'high' THEN
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'priority', 1,
      'title', 'Prepare renewal proposal',
      'description', 'Renewal needs immediate attention.',
      'reason', 'High renewal risk',
      'impact', 'retention',
      'estimated_arr', coalesce(ren.estimated_value, v_recurring),
      'action_type', 'renewal',
      'related_route', '/renewals'
    ));
  END IF;
  IF jsonb_array_length(v_proposed_not_purchased) > 0 THEN
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'priority', 2,
      'title', 'Revisit originally proposed items',
      'description', 'Items proposed but not purchased may still be relevant.',
      'reason', 'Proposal lineage gap',
      'impact', 'expansion',
      'estimated_arr', v_med + v_high,
      'action_type', 'upsell',
      'related_route', '/clients/' || client_uuid::text
    ));
  END IF;
  IF lic.id IS NOT NULL AND NOT coalesce(lic.sat_active,false) AND v_recurring > 0 THEN
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'priority', 3,
      'title', 'Attach Support & Assistance (S&AT)',
      'description', 'Quote S&AT alongside the next renewal.',
      'reason', 'No S&AT on recurring license',
      'impact', 'expansion',
      'estimated_arr', round(v_recurring * 0.18, 2),
      'action_type', 'upsell',
      'related_route', '/clients/' || client_uuid::text
    ));
  END IF;
  IF v_con_count > 0 AND NOT v_has_lines THEN
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid(), 'priority', 4,
      'title', 'Complete contract structure',
      'description', 'Contract has no detailed lines.',
      'reason', 'Missing commercial structure',
      'impact', 'data_quality',
      'estimated_arr', 0,
      'action_type', 'data',
      'related_route', '/clients/' || client_uuid::text
    ));
  END IF;

  RETURN QUERY SELECT
    c_row.id, v_partner_uuid, c_row.commercial_name, v_partner_name, c_row.country, c_row.sector,
    v_lic_count, v_con_count, v_ren_count,
    v_year1, v_recurring, v_one_time,
    ren.renewal_date, coalesce(ren.estimated_value, 0)::numeric, v_days,
    (v_lic_count > 0), (v_con_count > 0), (ren.id IS NOT NULL),
    lic.product, lic.edition, lic.deployment_type,
    coalesce(lic.backoffice_users, 0), coalesce(lic.web_accesses, 0),
    coalesce(lic.api_access, false), coalesce(lic.sat_active, false),
    v_active_modules, v_active_plugins,
    v_recurring_items, v_one_time_items, v_not_renewed,
    v_missing_modules, v_missing_plugins, v_proposed_not_purchased,
    v_upsell, v_risk, v_actions,
    v_score, (v_high + v_med)::numeric, v_high, v_med, v_low,
    v_renewal_risk, v_confidence, now();
END;
$function$;