"""add academic majors and section major assignments

Revision ID: c3d4e5f6a7b8
Revises: 8d8a21228242
Create Date: 2026-09-26 20:10:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c3d4e5f6a7b8"
down_revision = "8d8a21228242"
branch_labels = None
depends_on = None

academicmajorcode_enum = postgresql.ENUM(
    "AMG", "SMP", "WMAD", "IS", name="academicmajorcode", create_type=False
)


def upgrade() -> None:
    academicmajorcode_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "academic_majors",
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("code", academicmajorcode_enum, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("display_in_section_name", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["program_id"], ["academic_programs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_academic_majors_program_id", "academic_majors", ["program_id"])
    op.create_index("ix_academic_majors_code", "academic_majors", ["code"])
    op.create_unique_constraint(
        "uq_academic_major_program_code", "academic_majors", ["program_id", "code"]
    )

    op.create_table(
        "academic_section_majors",
        sa.Column("section_id", sa.Uuid(), nullable=False),
        sa.Column("major_id", sa.Uuid(), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["major_id"], ["academic_majors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["section_id"], ["academic_sections.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("section_id"),
    )
    op.create_index(
        "ix_academic_section_majors_major_id", "academic_section_majors", ["major_id"]
    )

    # Ensure the two CCS programs exist before creating the 2026-2027 catalog.
    op.execute(
        sa.text(
            """
            INSERT INTO academic_programs (id, program_code, program_name, created_at, updated_at)
            SELECT gen_random_uuid(), 'BSIT', 'Bachelor of Science in Information Technology', now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM academic_programs WHERE program_code = 'BSIT')
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO academic_programs (id, program_code, program_name, created_at, updated_at)
            SELECT gen_random_uuid(), 'BSCS', 'Bachelor of Science in Computer Science', now(), now()
            WHERE NOT EXISTS (SELECT 1 FROM academic_programs WHERE program_code = 'BSCS')
            """
        )
    )

    # Majors begin at third year. BSCS has one major, Intelligent Systems, but
    # its code is intentionally hidden from the displayed section name.
    for code, name, program, display in [
        ("AMG", "Animation and Motion Graphics", "BSIT", True),
        ("SMP", "Service Management Program", "BSIT", True),
        ("WMAD", "Web and Mobile Application Development", "BSIT", True),
        ("IS", "Intelligent Systems", "BSCS", False),
    ]:
        op.execute(
            sa.text(
                """
                INSERT INTO academic_majors
                    (id, program_id, code, name, display_in_section_name, created_at, updated_at)
                SELECT gen_random_uuid(), p.id, CAST(:code AS academicmajorcode), :name, :display, now(), now()
                FROM academic_programs p
                WHERE p.program_code = :program
                  AND NOT EXISTS (
                      SELECT 1 FROM academic_majors m
                      WHERE m.program_id = p.id AND m.code::text = :code
                  )
                """
            ).bindparams(code=code, name=name, program=program, display=display)
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
        op.execute(
            sa.text(
                """
                INSERT INTO academic_sections
                    (id, program_id, year_level, section_name, academic_year, created_at, updated_at)
                SELECT gen_random_uuid(), p.id, :year_level, :section_name, '2026-2027', now(), now()
                FROM academic_programs p
                WHERE p.program_code = :program
                  AND NOT EXISTS (
                      SELECT 1 FROM academic_sections s
                      WHERE s.program_id = p.id
                        AND s.year_level = :year_level
                        AND s.section_name = :section_name
                        AND s.academic_year = '2026-2027'
                  )
                """
            ).bindparams(
                program=program, year_level=year_level, section_name=section_name
            )
        )

    # Assign the appropriate major to all third- and fourth-year sections.
    major_assignments = [
        ("BSCS", "3A", "IS"),
        ("BSCS", "4A", "IS"),
        ("BSIT", "AMG 3A", "AMG"),
        ("BSIT", "SMP 3A", "SMP"),
        ("BSIT", "WMAD 3A", "WMAD"),
        ("BSIT", "WMAD 3B", "WMAD"),
        ("BSIT", "AMG 4A", "AMG"),
        ("BSIT", "SMP 4A", "SMP"),
        ("BSIT", "WMAD 4A", "WMAD"),
        ("BSIT", "WMAD 4B", "WMAD"),
    ]
    for program, section_name, major_code in major_assignments:
        op.execute(
            sa.text(
                """
                INSERT INTO academic_section_majors (id, section_id, major_id, created_at, updated_at)
                SELECT gen_random_uuid(), s.id, m.id, now(), now()
                FROM academic_sections s
                JOIN academic_programs p ON p.id = s.program_id
                JOIN academic_majors m ON m.program_id = p.id
                WHERE p.program_code = :program
                  AND s.section_name = :section_name
                  AND s.academic_year = '2026-2027'
                  AND m.code::text = :major_code
                  AND NOT EXISTS (
                      SELECT 1 FROM academic_section_majors sm WHERE sm.section_id = s.id
                  )
                """
            ).bindparams(
                program=program, section_name=section_name, major_code=major_code
            )
        )


def downgrade() -> None:
    op.drop_table("academic_section_majors")
    op.drop_table("academic_majors")
    academicmajorcode_enum.drop(op.get_bind(), checkfirst=True)
