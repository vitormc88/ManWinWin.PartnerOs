DELETE FROM public.deals WHERE id::text LIKE '0e000000-0000-4000-8000-0000000001%' AND company_name LIKE 'QA Direct — %';
DELETE FROM public.role_permission_templates WHERE role='hq_standard' AND module_key='sales' AND access_level='no_access';
