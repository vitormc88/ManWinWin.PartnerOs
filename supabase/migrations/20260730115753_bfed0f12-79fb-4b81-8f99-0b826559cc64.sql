DO $mig$
DECLARE
  d text;
  n text;
  pairs text[][] := ARRAY[
    ARRAY[
      $a1$  v_has_lines boolean;$a1$,
      $b1$  v_has_lines boolean;
  v_contract record;
  v_next_renewal_date date;
  v_next_renewal_value numeric := 0;
  v_renewal_source text := 'none';
  v_arr_estimated boolean := false;$b1$
    ],
    ARRAY[
      $a2$  v_days := CASE WHEN ren.renewal_date IS NOT NULL THEN (ren.renewal_date - current_date) END;$a2$,
      $b2$  SELECT * INTO v_contract FROM public.contracts
    WHERE contracts.client_id = client_uuid AND contract_end_date IS NOT NULL
    ORDER BY contract_end_date DESC LIMIT 1;

  IF ren.renewal_date IS NOT NULL THEN
    v_next_renewal_date := ren.renewal_date;
    v_renewal_source := 'renewal';
  ELSIF v_contract.contract_end_date IS NOT NULL THEN
    v_next_renewal_date := v_contract.contract_end_date;
    v_renewal_source := 'contract';
  ELSIF lic.license_end_date IS NOT NULL THEN
    v_next_renewal_date := lic.license_end_date;
    v_renewal_source := 'license';
  END IF;

  v_days := CASE WHEN v_next_renewal_date IS NOT NULL THEN (v_next_renewal_date - current_date) END;$b2$
    ],
    ARRAY[
      $a3$      WHEN cl.line_type IN ('license','hosting','sat','mww_web','module','plugin') THEN cl.amount
      ELSE 0
    END),0),$a3$,
      $b3$      WHEN cl.line_type IN ('license','hosting','sat','mww_web','module','plugin','service') THEN cl.amount
      ELSE 0
    END),0),$b3$
    ],
    ARRAY[
      $a4$      WHEN cl.line_type IN ('implementation','training','other') THEN cl.amount
      ELSE 0
    END),0)
  INTO v_recurring_lines, v_one_time$a4$,
      $b4$      WHEN cl.line_type IN ('license','hosting','sat','mww_web','module','plugin','service','discount') THEN 0
      ELSE cl.amount
    END),0)
  INTO v_recurring_lines, v_one_time$b4$
    ],
    ARRAY[
      $a5$  v_recurring := coalesce(nullif(ren.estimated_value, 0), v_recurring_lines);
  v_year1 := v_recurring_lines + v_one_time;
  v_has_lines := EXISTS (SELECT 1 FROM public.contract_lines WHERE contract_lines.client_id = client_uuid);$a5$,
      $b5$  v_has_lines := EXISTS (SELECT 1 FROM public.contract_lines WHERE contract_lines.client_id = client_uuid);

  IF NOT v_has_lines THEN
    SELECT coalesce(max(ct.total_value), 0) INTO v_recurring_lines
      FROM public.contracts ct WHERE ct.client_id = client_uuid;
    v_arr_estimated := coalesce(v_recurring_lines, 0) > 0;
    v_recurring_lines := coalesce(v_recurring_lines, 0);
  END IF;

  v_recurring := coalesce(nullif(ren.estimated_value, 0), v_recurring_lines);
  v_year1 := v_recurring_lines + v_one_time;
  v_next_renewal_value := coalesce(nullif(ren.estimated_value, 0), v_recurring);$b5$
    ],
    ARRAY[
      $a6$    AND cl.line_type IN ('license','hosting','sat','mww_web','module','plugin')
    AND (cl.billing_frequency IS NULL OR lower(cl.billing_frequency) NOT IN ('one-time','one_time','once'));$a6$,
      $b6$    AND cl.line_type IN ('license','hosting','sat','mww_web','module','plugin','service')
    AND (cl.billing_frequency IS NULL OR lower(cl.billing_frequency) NOT IN ('one-time','one_time','once'));$b6$
    ],
    ARRAY[
      $a7$      cl.line_type IN ('implementation','training','other')
      OR lower(coalesce(cl.billing_frequency,'')) IN ('one-time','one_time','once')$a7$,
      $b7$      cl.line_type NOT IN ('license','hosting','sat','mww_web','module','plugin','service','discount')
      OR lower(coalesce(cl.billing_frequency,'')) IN ('one-time','one_time','once')$b7$
    ],
    ARRAY[
      $a8$  IF ren.renewal_date IS NOT NULL AND ren.renewal_date < current_date THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','renewal_overdue','severity','high','message','Renewal overdue'));
  END IF;$a8$,
      $b8$  IF v_next_renewal_date IS NOT NULL AND v_next_renewal_date < current_date THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','renewal_overdue','severity','high','message','Renewal overdue'));
  END IF;
  IF v_arr_estimated THEN
    v_risk := v_risk || jsonb_build_array(jsonb_build_object('code','arr_estimated','severity','medium','message','ARR estimated from contract header (no contract lines)'));
  END IF;$b8$
    ],
    ARRAY[
      $a9$  IF ren.renewal_date IS NOT NULL AND ren.renewal_date < current_date THEN
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
  END IF;$a9$,
      $b9$  IF v_next_renewal_date IS NOT NULL AND v_next_renewal_date < current_date THEN
    v_renewal_risk := 'high';
  ELSIF v_days IS NOT NULL AND v_days <= 30 AND ren.assigned_user_id IS NULL THEN
    v_renewal_risk := 'high';
  ELSIF v_days IS NOT NULL AND v_days <= 90 THEN
    v_renewal_risk := 'medium';
  ELSIF v_next_renewal_date IS NOT NULL THEN
    v_renewal_risk := 'low';
  ELSIF v_lic_count > 0 THEN
    v_renewal_risk := 'high';
  ELSE
    v_renewal_risk := 'unknown';
  END IF;$b9$
    ],
    ARRAY[
      $aa$  IF ren.renewal_date IS NOT NULL AND ren.renewal_date < current_date THEN v_score := v_score - 20; END IF;$aa$,
      $ba$  IF v_next_renewal_date IS NOT NULL AND v_next_renewal_date < current_date THEN v_score := v_score - 20; END IF;$ba$
    ],
    ARRAY[
      $ab$  ELSIF v_lic_count > 0 OR v_con_count > 0 THEN
    v_confidence := 'medium';$ab$,
      $bb$  ELSIF (v_lic_count > 0 OR v_con_count > 0) AND NOT v_arr_estimated THEN
    v_confidence := 'medium';$bb$
    ],
    ARRAY[
      $ac$    ren.renewal_date, coalesce(ren.estimated_value, 0)::numeric, v_days,$ac$,
      $bc$    v_next_renewal_date, coalesce(v_next_renewal_value, 0)::numeric, v_days,$bc$
    ]
  ];
  i int;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname = 'get_client_commercial_intelligence';
  IF d IS NULL THEN RAISE EXCEPTION 'function not found'; END IF;
  FOR i IN 1 .. array_length(pairs, 1) LOOP
    IF position(pairs[i][1] IN d) = 0 THEN
      RAISE EXCEPTION 'patch % did not match', i;
    END IF;
    d := replace(d, pairs[i][1], pairs[i][2]);
  END LOOP;
  EXECUTE d;
END;
$mig$;