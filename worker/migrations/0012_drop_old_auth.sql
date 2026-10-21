-- S4b: remove the old sign-in's tables. Sign-in is BetterAuth's now (0011
-- carried the Google links over to user/account; roles became user.role).
-- player_auth_profiles' Facebook links (per-app ids, unusable by us) go too;
-- those players' emails are on players.email for linking later (V1).
-- Rollback: restore these tables from the pre-0012 backup / D1 Time Travel.

DROP TABLE player_roles;
DROP TABLE player_auth_profiles;
DROP TABLE roles;
