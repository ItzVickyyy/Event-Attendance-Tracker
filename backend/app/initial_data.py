import logging

from sqlalchemy import text
from sqlmodel import Session

from app.core.db import engine, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _seed_academic_catalog(session: Session) -> None:
    session.exec(
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
    session.exec(
        text("""
        UPDATE academic_years
        SET is_current = true, updated_at = now()
        WHERE label = '2026-2027'
          AND NOT EXISTS (
              SELECT 1 FROM academic_years WHERE is_current = true
          )
    """)
    )
    session.exec(
        text("""
        INSERT INTO academic_programs (id, program_code, program_name, created_at, updated_at)
        SELECT gen_random_uuid(), 'BSIT', 'Bachelor of Science in Information Technology', now(), now()
        WHERE NOT EXISTS (SELECT 1 FROM academic_programs WHERE program_code = 'BSIT')
    """)
    )
    session.exec(
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
        session.exec(
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
        session.exec(
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

    session.exec(
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
        session.exec(
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
