-- V8 club admin (MULTI-CLUB.md): a club's settings are what the admin screens
-- edit. The seniors play on Tuesdays (weekday 2, Sunday = 0), which the code
-- had hard-coded. Settings nothing reads are dropped (box sizes and sets per
-- match were never used; the timezone and HelloClub account are the
-- organisation's, in wrangler.toml). Data only: no schema change.
UPDATE clubs
SET config = json_remove(
  json_set(config, '$.weekday', 2),
  '$.minBoxSize',
  '$.maxBoxSize',
  '$.setsPerMatch',
  '$.timezone',
  '$.hcSubdomain'
)
WHERE id = 1;
