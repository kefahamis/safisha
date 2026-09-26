-- Databases seeded before companies and estates moved out of code keep the ones they were built on.
-- A fresh database has no clients yet, so nothing is inserted there.
INSERT INTO "companies" ("id", "name", "paybill", "care", "hours", "color", "created_at")
SELECT v.* FROM (VALUES
  ('TS', 'Taka Safi Services', '400221', '0709 400 221', 'Mon–Sat, 7am–7pm', '#0E7490', '2026-09-01 09:00'),
  ('KW', 'Kijani Waste Ltd', '400318', '0711 318 000', 'Mon–Fri, 8am–6pm', '#2FB86A', '2026-09-01 09:00'),
  ('MZ', 'Mazingira Collectors', '400455', '0722 455 455', 'Daily, 6am–8pm', '#F07A45', '2026-09-01 09:00')
) AS v WHERE EXISTS (SELECT 1 FROM "clients" WHERE "company" = v.column1)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "estates" ("code", "name", "lat", "lng", "radius", "days", "company", "created_at")
SELECT v.code, v.name, v.lat, v.lng, v.radius, v.days::jsonb, v.company, '2026-09-01 09:00' FROM (VALUES
  ('RUA', 'Ruaka', -1.2028, 36.7736, 1400, '[2,5]', 'KW'),
  ('KAS', 'Kasarani', -1.2226, 36.8964, 2000, '[1,4]', 'KW'),
  ('WES', 'Westlands', -1.2674, 36.8108, 1500, '[2,5]', 'TS'),
  ('LAV', 'Lavington', -1.2793, 36.7712, 1500, '[1,4]', 'TS'),
  ('KIL', 'Kilimani', -1.2906, 36.7869, 1400, '[1,4]', 'TS'),
  ('UMO', 'Umoja', -1.2812, 36.8896, 1500, '[3,6]', 'KW'),
  ('SOB', 'South B', -1.309, 36.8334, 1400, '[2,5]', 'MZ'),
  ('EMB', 'Embakasi', -1.3218, 36.8942, 2200, '[1,4]', 'MZ'),
  ('LAN', 'Lang’ata', -1.338, 36.756, 2000, '[3,6]', 'MZ'),
  ('KAR', 'Karen', -1.319, 36.7076, 2600, '[3]', 'TS')
) AS v(code, name, lat, lng, radius, days, company) WHERE EXISTS (SELECT 1 FROM "companies" WHERE "id" = v.company)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
UPDATE "roles" SET "permissions" = "permissions" || '["platform.companies.manage"]'::jsonb WHERE "id" = 'platform_admin' AND NOT ("permissions" ? 'platform.companies.manage');
