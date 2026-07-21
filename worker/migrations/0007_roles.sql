CREATE TABLE roles (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

INSERT INTO roles (name) VALUES ('owner'), ('admin'), ('scorer'), ('player');

CREATE TABLE player_roles (
  player_id INTEGER NOT NULL REFERENCES players(id),
  role_id   INTEGER NOT NULL REFERENCES roles(id),
  PRIMARY KEY (player_id, role_id)
);
