CREATE TABLE users(
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


/*SERIAL PRIMARY KEY — SERIAL is Postgres shorthand for "auto-incrementing integer" (1, 2, 3, ... assigned automatically on each insert)

TIMESTAMPTZ — "timestamp with time zone." We deliberately use this over a plain TIMESTAMP (no time zone) — since this app could eventually have users across different time zones, storing time zone-aware timestamps avoids a whole category of subtle bugs later (a plain TIMESTAMP silently assumes one implicit time zone, which becomes ambiguous and error-prone once your users aren't all in the same place).*/