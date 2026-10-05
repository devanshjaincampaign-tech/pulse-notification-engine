-- Run in the application database as its administrator after creating the
-- pulse_app and pulse_migrator roles through your identity/secret manager.
-- Run migrations as pulse_migrator so its default privileges apply.
GRANT CONNECT ON DATABASE pulse_notifications TO pulse_app, pulse_migrator;
GRANT CREATE, USAGE ON SCHEMA public TO pulse_migrator;
GRANT USAGE ON SCHEMA public TO pulse_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pulse_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pulse_app;

ALTER DEFAULT PRIVILEGES FOR ROLE pulse_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pulse_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pulse_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pulse_app;
