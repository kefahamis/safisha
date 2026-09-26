CREATE TABLE "counters" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_versions" (
	"scope" text PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "bytes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "storage" text DEFAULT 'db' NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "size" integer;--> statement-breakpoint
-- Bumps the change counters for whoever can see a row. TG_ARGV[0] says how to find its company.
CREATE OR REPLACE FUNCTION bump_data_versions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind text := TG_ARGV[0];
  keys text[] := '{}';
  r jsonb;
  co text;
  cl text;
BEGIN
  FOR r IN
    SELECT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
      CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
    ]) AS x WHERE x IS NOT NULL
  LOOP
    co := NULL;
    cl := NULL;
    IF kind = 'global' THEN
      keys := keys || '*'::text;
    ELSIF kind = 'company' THEN
      co := r->>'company';
    ELSIF kind = 'public' THEN
      co := r->>'company';
      keys := keys || ('pub:' || co);
    ELSIF kind = 'self' THEN
      cl := r->>'id';
      co := r->>'company';
    ELSIF kind = 'client' THEN
      cl := r->>'client';
      SELECT c.company INTO co FROM clients c WHERE c.id = cl;
    ELSIF kind = 'ticket' THEN
      SELECT tk.client, tk.company INTO cl, co FROM tickets tk WHERE tk.id = r->>'ticket';
    ELSIF kind = 'truck' THEN
      SELECT tr.company INTO co FROM trucks tr WHERE tr.id = r->>'truck';
      keys := keys || ('pub:' || co);
    ELSIF kind = 'dump' THEN
      cl := r->>'reporter';
      co := r->>'company';
      keys := keys || (SELECT 'co:' || c.company FROM clients c WHERE c.id = cl);
    ELSIF kind = 'user' THEN
      co := r->'scope'->>'companyId';
    ELSIF kind = 'setting' THEN
      IF r->>'scope' = 'platform' THEN
        keys := keys || '*'::text;
      ELSE
        co := r->>'scope';
        keys := keys || ('pub:' || co);
      END IF;
    END IF;
    keys := keys || ('co:' || co) || ('cl:' || cl);
  END LOOP;
  -- In a fixed order, so two writers never wait on each other's counters in opposite orders.
  INSERT INTO data_versions (scope, version)
  SELECT k, 1 FROM (SELECT DISTINCT k FROM unnest(keys) AS k WHERE k IS NOT NULL ORDER BY k) s
  ON CONFLICT (scope) DO UPDATE SET version = data_versions.version + 1;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER versions_clients AFTER INSERT OR UPDATE OR DELETE ON clients FOR EACH ROW EXECUTE FUNCTION bump_data_versions('self');--> statement-breakpoint
CREATE TRIGGER versions_trucks AFTER INSERT OR UPDATE OR DELETE ON trucks FOR EACH ROW EXECUTE FUNCTION bump_data_versions('public');--> statement-breakpoint
CREATE TRIGGER versions_txns AFTER INSERT OR UPDATE OR DELETE ON txns FOR EACH ROW EXECUTE FUNCTION bump_data_versions('client');--> statement-breakpoint
CREATE TRIGGER versions_tickets AFTER INSERT OR UPDATE OR DELETE ON tickets FOR EACH ROW EXECUTE FUNCTION bump_data_versions('client');--> statement-breakpoint
CREATE TRIGGER versions_ticket_messages AFTER INSERT OR UPDATE OR DELETE ON ticket_messages FOR EACH ROW EXECUTE FUNCTION bump_data_versions('ticket');--> statement-breakpoint
CREATE TRIGGER versions_ticket_events AFTER INSERT OR UPDATE OR DELETE ON ticket_events FOR EACH ROW EXECUTE FUNCTION bump_data_versions('ticket');--> statement-breakpoint
CREATE TRIGGER versions_pickups AFTER INSERT OR UPDATE OR DELETE ON pickups FOR EACH ROW EXECUTE FUNCTION bump_data_versions('client');--> statement-breakpoint
CREATE TRIGGER versions_stops AFTER INSERT OR UPDATE OR DELETE ON stops FOR EACH ROW EXECUTE FUNCTION bump_data_versions('truck');--> statement-breakpoint
CREATE TRIGGER versions_route_orders AFTER INSERT OR UPDATE OR DELETE ON route_orders FOR EACH ROW EXECUTE FUNCTION bump_data_versions('truck');--> statement-breakpoint
CREATE TRIGGER versions_suspense AFTER INSERT OR UPDATE OR DELETE ON suspense FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_pickup_requests AFTER INSERT OR UPDATE OR DELETE ON pickup_requests FOR EACH ROW EXECUTE FUNCTION bump_data_versions('client');--> statement-breakpoint
CREATE TRIGGER versions_dump_reports AFTER INSERT OR UPDATE OR DELETE ON dump_reports FOR EACH ROW EXECUTE FUNCTION bump_data_versions('dump');--> statement-breakpoint
CREATE TRIGGER versions_settings AFTER INSERT OR UPDATE OR DELETE ON settings FOR EACH ROW EXECUTE FUNCTION bump_data_versions('setting');--> statement-breakpoint
CREATE TRIGGER versions_users AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION bump_data_versions('user');--> statement-breakpoint
CREATE TRIGGER versions_departments AFTER INSERT OR UPDATE OR DELETE ON departments FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_vehicles AFTER INSERT OR UPDATE OR DELETE ON vehicles FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_fleet_documents AFTER INSERT OR UPDATE OR DELETE ON fleet_documents FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_inspections AFTER INSERT OR UPDATE OR DELETE ON inspections FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_work_orders AFTER INSERT OR UPDATE OR DELETE ON work_orders FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_fuel_logs AFTER INSERT OR UPDATE OR DELETE ON fuel_logs FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_incidents AFTER INSERT OR UPDATE OR DELETE ON incidents FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_fleet_events AFTER INSERT OR UPDATE OR DELETE ON fleet_events FOR EACH ROW EXECUTE FUNCTION bump_data_versions('company');--> statement-breakpoint
CREATE TRIGGER versions_companies AFTER INSERT OR UPDATE OR DELETE ON companies FOR EACH ROW EXECUTE FUNCTION bump_data_versions('global');--> statement-breakpoint
CREATE TRIGGER versions_estates AFTER INSERT OR UPDATE OR DELETE ON estates FOR EACH ROW EXECUTE FUNCTION bump_data_versions('global');
