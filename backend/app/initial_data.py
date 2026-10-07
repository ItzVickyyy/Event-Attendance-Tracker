import logging

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _seed_academic_catalog(session: Session) -> None:
    connection = session.connection()
    # Reconcile legacy database drift on the same connection that performs
    # catalog seeding. This is a safety net for installations whose recorded
    # Alembic history is ahead of the physical academic-program schema.
    connection.execute(
        text(
            """
            ALTER TABLE academic_programs
                ALTER COLUMN program_name TYPE VARCHAR(255),
                ALTER COLUMN program_code TYPE VARCHAR(50)
            """
        )
    )
    session.commit()
    connection = session.connection()
    schema_state = connection.execute(
        text(
            """
            SELECT
                current_database(),
                current_schema(),
                format_type(attribute.atttypid, attribute.atttypmod)
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid = to_regclass('academic_programs')
              AND attribute.attname = 'program_name'
              AND NOT attribute.attisdropped
            """
        )
    ).one()
    column_state = connection.execute(
        text(
            """
            SELECT string_agg(
                format(
                    '%s=%s',
                    column_name,
                    COALESCE(character_maximum_length::text, data_type)
                    || ' default=' || COALESCE(column_default, 'none')
                ),
                ', ' ORDER BY ordinal_position
            )
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'academic_programs'
            """
        )
    ).scalar_one()
    trigger_state = connection.execute(
        text(
            """
            SELECT COALESCE(
                string_agg(pg_get_triggerdef(trigger.oid), E'\\n'),
                'none'
            )
            FROM pg_trigger AS trigger
            WHERE trigger.tgrelid = to_regclass('academic_programs')
              AND NOT trigger.tgisinternal
            """
        )
    ).scalar_one()
    constraint_state = connection.execute(
        text(
            """
            SELECT COALESCE(
                string_agg(pg_get_constraintdef(con.oid), '; '),
                'none'
            )
            FROM pg_constraint AS con
            WHERE con.conrelid = to_regclass('academic_programs')
            """
        )
    ).scalar_one()
    rule_state = connection.execute(
        text(
            """
            SELECT COALESCE(string_agg(pg_get_ruledef(rw.oid), '; '), 'none')
            FROM pg_rewrite AS rw
            WHERE rw.ev_class = to_regclass('academic_programs')
              AND rw.rulename <> '_RETURN'
            """
        )
    ).scalar_one()
    logger.info(
        "Academic catalog schema after repair: database=%s schema=%s "
        "program_name_type=%s columns=%s triggers=%s constraints=%s rules=%s",
        schema_state[0],
        schema_state[1],
        schema_state[2],
        column_state,
        trigger_state,
        constraint_state,
        rule_state,
    )
    connection.execute(
        text(
            """
        INSERT INTO academic_years
            (id, label, start_year, end_year, is_current, created_at, updated_at)
        SELECT gen_random_uuid(), '2026-2027', 2026, 2027, false, now(), now()
        WHERE NOT EXISTS (
            SELECT 1 FROM academic_years WHERE label = '2026-2027'
        )
    """
        )
    )
    connection.execute(
        text("""
        UPDATE academic_years
        SET is_current = true, updated_at = now()
        WHERE label = '2026-2027'
          AND NOT EXISTS (
              SELECT 1 FROM academic_years WHERE is_current = true
          )
    """)
    )
    connection.execute(
        text("""
        INSERT INTO academic_programs (id, program_code, program_name, created_at, updated_at)
        SELECT gen_random_uuid(), 'BSIT', 'Bachelor of Science in Information Technology', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM academic_programs WHERE program_code = 'BSIT')
    """)
    )
    connection.execute(
        text("""
        INSERT INTO academic_programs (id, program_code, program_name, created_at, updated_at)
        SELECT gen_random_uuid(), 'BSCS', 'Bachelor of Science in Computer Science', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM academic_programs WHERE program_code = 'BSCS')
    """)
    )

    for code, name in [
        ("AMG", "Animation and Motion Graphics"),
        ("SMP", "Service Management Program"),
        ("WMAD", "Web and Mobile Application Development"),
    ]:
        connection.execute(
            text("""
            INSERT INTO academic_majors
                (id, program_id, code, name, display_in_section_name, created_at, updated_at)
            SELECT gen_random_uuid(), p.id, CAST(:code AS academicmajorcode), :name, true, now(), now()
            FROM academic_programs p
            WHERE p.program_code = 'BSIT'
              AND NOT EXISTS (
                  SELECT 1 FROM academic_majors m
                  WHERE m.program_id = p.id AND m.code::text = :code
              )
        """).bindparams(code=code, name=name)
        )

    sections = [
        ("BSCS", "1st Year", "1A"),
        ("BSCS", "2nd Year", "2A"),
        ("BSCS", "3rd Year", "3A"),
        ("BSCS", "4th Year", "4A"),
        ("BSIT", "1st Year", "1A"),
        ("BSIT", "1st Year", "1B"),
        ("BSIT", "1st Year", "1C"),
        ("BSIT", "1st Year", "1D"),
        ("BSIT", "2nd Year", "2A"),
        ("BSIT", "2nd Year", "2B"),
        ("BSIT", "2nd Year", "2C"),
        ("BSIT", "3rd Year", "AMG 3A"),
        ("BSIT", "3rd Year", "SMP 3A"),
        ("BSIT", "3rd Year", "WMAD 3A"),
        ("BSIT", "3rd Year", "WMAD 3B"),
        ("BSIT", "4th Year", "AMG 4A"),
        ("BSIT", "4th Year", "SMP 4A"),
        ("BSIT", "4th Year", "WMAD 4A"),
        ("BSIT", "4th Year", "WMAD 4B"),
    ]
    for program, year_level, section_name in sections:
        connection.execute(
            text("""
            INSERT INTO academic_sections
                (id, program_id, year_level, section_name, academic_year,
                 academic_year_id, section_code, created_at, updated_at)
            SELECT gen_random_uuid(), p.id, :year_level, :section_name,
                   ay.label, ay.id, :section_name, now(), now()
            FROM academic_programs p
            JOIN academic_years ay ON ay.label = '2026-2027'
            WHERE p.program_code = :program
              AND NOT EXISTS (
                  SELECT 1 FROM academic_sections s
                  WHERE s.program_id = p.id
                    AND s.year_level = :year_level
                    AND s.section_name = :section_name
                    AND s.academic_year = '2026-2027'
              )
        """).bindparams(
                program=program, year_level=year_level, section_name=section_name
            )
        )

    connection.execute(
        text("""
        UPDATE academic_sections s
        SET academic_year_id = ay.id,
            section_code = COALESCE(s.section_code, s.section_name),
            updated_at = now()
        FROM academic_years ay
        WHERE s.academic_year = ay.label
          AND s.academic_year_id IS NULL
    """)
    )

    for program, section_name, major_code in [
        ("BSIT", "AMG 3A", "AMG"),
        ("BSIT", "SMP 3A", "SMP"),
        ("BSIT", "WMAD 3A", "WMAD"),
        ("BSIT", "WMAD 3B", "WMAD"),
        ("BSIT", "AMG 4A", "AMG"),
        ("BSIT", "SMP 4A", "SMP"),
        ("BSIT", "WMAD 4A", "WMAD"),
        ("BSIT", "WMAD 4B", "WMAD"),
    ]:
        connection.execute(
            text("""
            INSERT INTO academic_section_majors
                (id, section_id, major_id, created_at, updated_at)
            SELECT gen_random_uuid(), s.id, m.id, now(), now()
            FROM academic_sections s
            JOIN academic_programs p ON p.id = s.program_id
            JOIN academic_majors m
              ON m.program_id = p.id
             AND m.code::text = :major_code
            WHERE p.program_code = :program
              AND s.section_name = :section_name
              AND s.academic_year = '2026-2027'
              AND NOT EXISTS (
                  SELECT 1 FROM academic_section_majors sm
                  WHERE sm.section_id = s.id
              )
        """).bindparams(
                program=program, section_name=section_name, major_code=major_code
            )
        )

    # Seed the development Class Representative account with a real assignment.
    # The account is created by the authentication seed, while this assignment
    # depends on the academic catalog created above.
    connection.execute(
        text("""
        INSERT INTO class_representative_assignments
            (id, user_id, academic_year_id, section_id, created_at, updated_at)
        SELECT gen_random_uuid(), u.id, ay.id, s.id, now(), now()
        FROM "user" u
        JOIN academic_years ay
          ON ay.label = '2026-2027'
        JOIN academic_sections s
          ON s.academic_year_id = ay.id
         AND s.section_name = 'WMAD 3A'
        JOIN academic_programs p
          ON p.id = s.program_id
         AND p.program_code = 'BSIT'
        WHERE lower(u.email) = lower('ClassRep@sample.com')
          AND u.role = 'class_representative'
          AND NOT EXISTS (
              SELECT 1
              FROM class_representative_assignments cra
              WHERE cra.user_id = u.id
                AND cra.academic_year_id = ay.id
          )
    """)
    )

    session.commit()


def init() -> None:
    with Session(engine) as session:
        init_db(session)
        _seed_academic_catalog(session)


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Initial data created")


if __name__ == "__main__":
    main()
