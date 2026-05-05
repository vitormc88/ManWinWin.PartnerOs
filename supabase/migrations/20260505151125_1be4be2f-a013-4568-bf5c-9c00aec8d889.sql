CREATE UNIQUE INDEX IF NOT EXISTS partners_company_name_unique_normalized_idx
ON public.partners (lower(btrim(company_name)));

CREATE OR REPLACE FUNCTION public.generate_partner_code(_country_code text, _company_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_country text;
  normalized_name text;
  short_name text;
  next_sequence bigint;
BEGIN
  normalized_country := upper(left(coalesce(btrim(_country_code), ''), 2));
  normalized_name := upper(regexp_replace(coalesce(_company_name, ''), '[^A-Za-z0-9]+', '', 'g'));
  short_name := left(normalized_name, 3);

  IF normalized_country = '' THEN
    RAISE EXCEPTION 'Country code is required';
  END IF;

  IF short_name = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  next_sequence := nextval('public.partner_code_seq');

  RETURN format('%s-%s-%s', normalized_country, short_name, lpad(next_sequence::text, 3, '0'));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_partner_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.company_name IS NULL OR btrim(new.company_name) = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  IF new.country IS NULL OR btrim(new.country) = '' THEN
    RAISE EXCEPTION 'Country code is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.partners p
    WHERE lower(btrim(p.company_name)) = lower(btrim(new.company_name))
      AND p.id <> coalesce(new.id, gen_random_uuid())
  ) THEN
    RAISE EXCEPTION 'A partner with this company name already exists';
  END IF;

  IF tg_op = 'INSERT' OR new.partner_code IS NULL OR btrim(new.partner_code) = '' THEN
    new.partner_code := public.generate_partner_code(new.country, new.company_name);
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS partners_set_partner_code ON public.partners;
CREATE TRIGGER partners_set_partner_code
BEFORE INSERT OR UPDATE OF company_name, country, partner_code
ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.set_partner_code();