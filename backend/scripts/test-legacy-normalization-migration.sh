#!/usr/bin/env bash
set -euo pipefail

: "${MIGRATION_REHEARSAL_DATABASE_URL:?Set this to a dedicated, disposable PostgreSQL database URL.}"
export ALEMBIC_DATABASE_URL="$MIGRATION_REHEARSAL_DATABASE_URL"

psql_url="${MIGRATION_REHEARSAL_DATABASE_URL/postgresql+psycopg:/postgresql:}"
psql_url="${psql_url/postgresql:/postgresql:}"

echo "== Upgrade legacy schema to bdb851e7e407 =="
uv run alembic upgrade bdb851e7e407

echo "== Seed representative legacy records =="
psql "$psql_url" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.event
    (id, event_name, event_date, start_time, end_time, attendance_mode, organizer, status,
     created_at, updated_at)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'Migration Rehearsal Event', '2026-10-09',
     '09:00', '10:00', 'time_in_only', 'Migration Test', 'open',
     '2026-10-09 01:00:00+00', '2026-10-09 01:00:00+00');

INSERT INTO public.student
    (id, student_number, first_name, middle_name, last_name, extension, year, section,
     nfc_uid, nfc_registered, created_at, updated_at)
VALUES
    ('20000000-0000-4000-8000-000000000002', 'MIGRATION-TEST-001', 'Test', 'M',
     'Student', NULL, '3', 'A', 'MIGRATION-NFC-001', TRUE,
     '2026-10-09 01:00:00+00', '2026-10-09 01:00:00+00');

INSERT INTO public.attendance
    (id, event_id, student_id, time_in, time_out, status, scan_method, scanned_by,
     created_at, updated_at)
VALUES
    ('30000000-0000-4000-8000-000000000003',
     '10000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000002',
     '2026-10-09 01:05:00+00', NULL, 'present', 'manual', NULL,
     '2026-10-09 01:05:00+00', '2026-10-09 01:05:00+00');
SQL

echo "== Upgrade and verify normalized records =="
uv run alembic upgrade 1197a9a57c90
psql "$psql_url" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    IF (SELECT version_num FROM public.alembic_version) <> '1197a9a57c90' THEN
        RAISE EXCEPTION 'Unexpected Alembic revision after upgrade';
    END IF;
    IF (SELECT count(*) FROM public.events) <> 1
       OR (SELECT count(*) FROM public.students) <> 1
       OR (SELECT count(*) FROM public.people) <> 1
       OR (SELECT count(*) FROM public.attendees) <> 1
       OR (SELECT count(*) FROM public.event_registrations) <> 1
       OR (SELECT count(*) FROM public.attendance) <> 1
       OR (SELECT count(*) FROM public.attendee_credentials) <> 1 THEN
        RAISE EXCEPTION 'Expected normalized record counts were not preserved';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.attendance a
        JOIN public.event_registrations er ON er.id = a.registration_id
        JOIN public.events e ON e.id = er.event_id
        JOIN public.attendees at ON at.id = er.attendee_id
        JOIN public.students s ON s.id = at.id
        JOIN public.people p ON p.id = s.person_id
        JOIN public.attendee_credentials ac ON ac.attendee_id = at.id
        WHERE a.id = '30000000-0000-4000-8000-000000000003'
          AND e.id = '10000000-0000-4000-8000-000000000001'
          AND s.id = '20000000-0000-4000-8000-000000000002'
          AND s.student_number = 'MIGRATION-TEST-001'
          AND p.middle_name = 'M'
          AND ac.credential_value = 'MIGRATION-NFC-001'
          AND ac.is_active IS TRUE
    ) THEN
        RAISE EXCEPTION 'Normalized event/student/attendance/NFC links were not preserved';
    END IF;
    IF to_regclass('public.event') IS NOT NULL OR to_regclass('public.student') IS NOT NULL THEN
        RAISE EXCEPTION 'Legacy tables still exist after successful normalization';
    END IF;
END
$$;
SQL

echo "== Downgrade and verify legacy records =="
uv run alembic downgrade bdb851e7e407
psql "$psql_url" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    IF (SELECT version_num FROM public.alembic_version) <> 'bdb851e7e407' THEN
        RAISE EXCEPTION 'Unexpected Alembic revision after downgrade';
    END IF;
    IF (SELECT count(*) FROM public.event) <> 1
       OR (SELECT count(*) FROM public.student) <> 1
       OR (SELECT count(*) FROM public.attendance) <> 1 THEN
        RAISE EXCEPTION 'Expected legacy record counts were not restored';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.attendance a
        JOIN public.event e ON e.id = a.event_id
        JOIN public.student s ON s.id = a.student_id
        WHERE a.id = '30000000-0000-4000-8000-000000000003'
          AND e.id = '10000000-0000-4000-8000-000000000001'
          AND e.organizer = 'Migration Test'
          AND s.id = '20000000-0000-4000-8000-000000000002'
          AND s.student_number = 'MIGRATION-TEST-001'
          AND s.nfc_uid = 'MIGRATION-NFC-001'
          AND s.nfc_registered IS TRUE
          AND a.status = 'present'
          AND a.scan_method = 'manual'
    ) THEN
        RAISE EXCEPTION 'Legacy event/student/attendance/NFC values were not restored';
    END IF;
END
$$;
SQL

echo "== Re-upgrade and verify repeatability =="
uv run alembic upgrade 1197a9a57c90
psql "$psql_url" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
    IF (SELECT version_num FROM public.alembic_version) <> '1197a9a57c90' THEN
        RAISE EXCEPTION 'Unexpected Alembic revision after repeat upgrade';
    END IF;
    IF (SELECT count(*) FROM public.events) <> 1
       OR (SELECT count(*) FROM public.students) <> 1
       OR (SELECT count(*) FROM public.attendance) <> 1
       OR (SELECT count(*) FROM public.attendee_credentials) <> 1 THEN
        RAISE EXCEPTION 'Repeat upgrade did not preserve all normalized records';
    END IF;
END
$$;
SQL

echo "Legacy normalization migration upgrade/downgrade/re-upgrade checks passed."
