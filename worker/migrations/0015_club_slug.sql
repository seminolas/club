-- V8 groundwork (MULTI-CLUB.md, option C): a club is addressed by a slug in
-- URLs (/seniors/…, /juniors/…), and its own settings live in its config.
-- Today's club becomes "seniors". The title and HelloClub event are what the
-- code had hard-coded; admin screens will edit them later.
ALTER TABLE clubs ADD COLUMN slug TEXT;
UPDATE clubs SET slug = 'seniors' WHERE id = 1;
CREATE UNIQUE INDEX clubs_slug ON clubs(slug);
UPDATE clubs
SET config = json_set(
  config,
  '$.label', 'Seniors',
  '$.title', 'Tuesday Box',
  '$.hcEvent', 'Senior Box'
)
WHERE id = 1;
