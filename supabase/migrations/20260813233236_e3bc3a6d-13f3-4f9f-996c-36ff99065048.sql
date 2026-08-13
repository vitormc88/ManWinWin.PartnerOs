UPDATE public.proposal_items SET change_kind='plan_change', source_plan=1, target_plan=3, item_code='plan_upgrade'
 WHERE proposal_id='3f0c2454-e67f-43fe-a24a-82667e164941' AND sort_order=0;
UPDATE public.proposal_items SET change_kind='access_addition', access_type='web', total_licensed_qty=4, included_qty=1, billable_qty=3
 WHERE proposal_id='3f0c2454-e67f-43fe-a24a-82667e164941' AND sort_order=1;
UPDATE public.proposal_items SET change_kind='implementation_delta', item_code='impl_p1_p3', implementation_source='manual_hq', justification='ZZVP0 synthetic HQ manual implementation'
 WHERE proposal_id='3f0c2454-e67f-43fe-a24a-82667e164941' AND sort_order=2;
UPDATE public.proposals SET implementation_source='manual_hq', implementation_justification='ZZVP0 synthetic HQ manual implementation', implementation_gross=1650, implementation_discount_amount=825
 WHERE id='3f0c2454-e67f-43fe-a24a-82667e164941';