-- Data-free TEST schema invariant, obtained from pg_catalog read-only on 2026-10-11.
-- Uses column-name sorted shape; physical position may differ after overlays.
-- Schema and SQL defaults only: no customer data, records or secrets.
DO $fin02_catalog_shape$
DECLARE
  want record;
  got record;
BEGIN
  FOR want IN SELECT * FROM (VALUES
    ('clients',40,'b844c757faf3d2c5dac2882ad2a58ad6'),
    ('contract_lines',18,'2f979070e995d4411475b8a30b69ab66'),
    ('contracts',26,'ccba6c74c9cc88d3aa74d3b0dcae620b'),
    ('deals',43,'88e03960190990d7f1e30dba2303419b'),
    ('licenses',44,'f42b11164b26f843f2bfbd1a59445807'),
    ('proposal_items',36,'96a285969e77bbeb574a3e461e2e3fe6'),
    ('proposals',80,'0ebeaa2d53ea23d8893080d0c58defc4'),
    ('renewals',40,'6337a71d4608fb8428e4201d58691e2a')
  ) AS expected(tab, cols, shape_md5) LOOP
    SELECT COUNT(*)::int AS cols,
      md5(string_agg(a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod)
      ||':'||a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),
      '|' ORDER BY a.attname)) AS shape_md5
    INTO got
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relname=want.tab
      AND a.attnum>0 AND NOT a.attisdropped;
    IF got.cols IS DISTINCT FROM want.cols OR
       got.shape_md5 IS DISTINCT FROM want.shape_md5 THEN
      RAISE EXCEPTION 'FIN02_TEST_TABLE_SHAPE_DRIFT: % columns=% expected=%, shape=% expected=%',
         want.tab,got.cols,want.cols,got.shape_md5,want.shape_md5;
    END IF;
  END LOOP;
  RAISE NOTICE 'FIN02 eight PROD-base/TEST-overlay financial table columns match read-only TEST (sorted type, default, nullability)';
END
$fin02_catalog_shape$;
