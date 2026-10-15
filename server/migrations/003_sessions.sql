-- Up Migration
-- Login sessions. Used by the connect-pg-simple library.
CREATE TABLE session (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);

-- Down Migration
DROP TABLE session;