-- S4a: BetterAuth (sign-in) tables, and players.user_id linking a player to
-- their login. Table definitions as drizzle-kit generates them for
-- src/db/schema.ts (schema.test.ts checks they match).
--
-- Data: every player with a Google link in player_auth_profiles gets a
-- BetterAuth user (id 'player-<player id>') with one Google account per link
-- (Google's `sub` is the account id, so their next Google sign-in finds it),
-- and the player is linked to it. Owners and admins get role 'admin',
-- everyone else 'user' (player). Facebook links aren't carried over: Facebook
-- ids are per app, so HelloClub's don't match ours. Existing tables are
-- untouched; the old login keeps working until S4b removes it.
-- Rollback: DROP TABLE session, account, verification, user (children first)
-- after ALTER TABLE players DROP COLUMN user_id (drop index players_user_id first).

CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'user',
	`banned` integer,
	`ban_reason` text,
	`ban_expires` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
CREATE INDEX `session_user_id` ON `session` (`user_id`);
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX `account_user_id` ON `account` (`user_id`);
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);

CREATE INDEX `verification_identifier` ON `verification` (`identifier`);
ALTER TABLE `players` ADD `user_id` text REFERENCES user(id);
CREATE UNIQUE INDEX `players_user_id` ON `players` (`user_id`);

INSERT INTO `user` (id, name, email, email_verified, role, created_at, updated_at)
SELECT
  'player-' || p.id,
  p.name,
  -- BetterAuth needs an email; sign-in matches on Google's id, not this.
  COALESCE(
    (SELECT lower(a.email) FROM player_auth_profiles a
      WHERE a.player_id = p.id AND a.provider = 'google' AND a.email IS NOT NULL
      ORDER BY a.id LIMIT 1),
    'player-' || p.id || '@no-email.invalid'
  ),
  1,
  CASE WHEN EXISTS (
    SELECT 1 FROM player_roles pr JOIN roles r ON r.id = pr.role_id
    WHERE pr.player_id = p.id AND r.name IN ('owner', 'admin')
  ) THEN 'admin' ELSE 'user' END,
  unixepoch(),
  unixepoch()
FROM players p
WHERE EXISTS (
  SELECT 1 FROM player_auth_profiles a WHERE a.player_id = p.id AND a.provider = 'google'
);

INSERT INTO `account` (id, account_id, provider_id, user_id, created_at, updated_at)
SELECT 'google-' || a.id, a.provider_id, 'google', 'player-' || a.player_id, unixepoch(), unixepoch()
FROM player_auth_profiles a
WHERE a.provider = 'google';

UPDATE `players` SET user_id = 'player-' || id
WHERE EXISTS (
  SELECT 1 FROM player_auth_profiles a WHERE a.player_id = players.id AND a.provider = 'google'
);
