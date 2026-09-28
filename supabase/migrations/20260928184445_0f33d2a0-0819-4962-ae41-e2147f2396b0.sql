CREATE OR REPLACE FUNCTION public.renewal_notify(_renewal_id uuid, _client_id uuid, _partner_id text, _event text, _recipient uuid, _title text, _message text, _type text DEFAULT 'info'::text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _action boolean;
BEGIN
  IF _recipient IS NULL THEN RETURN false; END IF;
  _action := _event ~* '(overdue|critical|reassign|owner)' OR _event = 'action_required';
  RETURN public.notify(
    'renewal.' || _event, _recipient, _title, _message,
    CASE WHEN _action THEN 'action_required' ELSE 'important' END,
    'renewal', _renewal_id, '/renewals?renewal=' || _renewal_id::text,
    'renewal:' || _renewal_id::text || ':' || _event || ':' || _recipient::text,
    _action, _type, 'renewal', _partner_id, _client_id, _renewal_id);
END;
$function$;