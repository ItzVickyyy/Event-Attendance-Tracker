"""normalize_schema_3nf

Revision ID: 1197a9a57c90
Revises: bdb851e7e407
Create Date: 2026-09-12 17:45:39.755939

"""
import uuid

from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '1197a9a57c90'
down_revision = 'bdb851e7e407'
branch_labels = None
depends_on = None

# Define Enum types with create_type=False so create_table does not re-create them
attendancemode_enum = postgresql.ENUM('time_in_only', 'time_in_time_out', name='attendancemode', create_type=False)
eventstatus_enum = postgresql.ENUM('draft', 'open', 'closed', name='eventstatus', create_type=False)
attendancestatus_enum = postgresql.ENUM('present', 'time_in_only', 'completed', 'incomplete', name='attendancestatus', create_type=False)
scanmethod_enum = postgresql.ENUM('nfc', 'qr', 'manual', name='scanmethod', create_type=False)

attendeetype_enum = postgresql.ENUM('student', 'faculty', 'staff', 'parent_guardian', 'guest', name='attendeetype', create_type=False)
credentialtype_enum = postgresql.ENUM('nfc', 'qr', name='credentialtype', create_type=False)
relationshiptype_enum = postgresql.ENUM('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other', name='relationshiptype', create_type=False)
registrationstatus_enum = postgresql.ENUM('registered', 'cancelled', name='registrationstatus', create_type=False)




def _legacy_uuid(value: str) -> uuid.UUID:
    """Return a stable UUID for records created while normalizing legacy data."""
    return uuid.uuid5(uuid.NAMESPACE_URL, f"event-attendance-tracker:legacy:{value}")


def _copy_legacy_records(bind):
    """Copy legacy event, student, NFC, and attendance relationships before dropping old tables."""
    legacy_events = bind.execute(sa.text(
        "SELECT id, event_name, event_date, start_time, end_time, attendance_mode, "
        "organizer, status, created_at, updated_at FROM event ORDER BY id"
    )).mappings().all()
    legacy_students = bind.execute(sa.text(
        "SELECT id, student_number, first_name, middle_name, last_name, extension, "
        "year, section, nfc_uid, nfc_registered, created_at, updated_at "
        "FROM student ORDER BY id"
    )).mappings().all()
    legacy_attendance = bind.execute(sa.text(
        "SELECT id, event_id, student_id, created_at, updated_at FROM attendance ORDER BY id"
    )).mappings().all()

    # The normalized credential model cannot represent "registered" without a UID.
    # Stop rather than silently discard this inconsistent legacy state.
    inconsistent_nfc_count = bind.execute(sa.text(
        "SELECT count(*) FROM student WHERE nfc_registered IS TRUE AND nfc_uid IS NULL"
    )).scalar_one()
    if inconsistent_nfc_count:
        raise RuntimeError(
            f"Cannot normalize safely: {inconsistent_nfc_count} students are marked NFC-registered "
            "but have no NFC UID. Correct those records before retrying."
        )

    organization_ids = {}
    organizations = {}
    for event in legacy_events:
        organizer = event["organizer"]
        if organizer not in organization_ids:
            organization_id = _legacy_uuid(f"organization:{organizer}")
            organization_ids[organizer] = organization_id
            organizations[organizer] = {
                "id": organization_id,
                "name": organizer,
                "description": None,
                "created_at": None,
                "updated_at": None,
            }
    if organizations:
        bind.execute(sa.text(
            "INSERT INTO organizations (id, name, description, created_at, updated_at) "
            "VALUES (:id, :name, :description, :created_at, :updated_at)"
        ), list(organizations.values()))

    program_id = _legacy_uuid("academic-program")
    section_ids = {}
    if legacy_students:
        bind.execute(sa.text(
            "INSERT INTO academic_programs (id, program_code, program_name, created_at, updated_at) "
            "VALUES (:id, :program_code, :program_name, NULL, NULL)"
        ), {
            "id": program_id,
            "program_code": "LEGACY",
            "program_name": "Legacy imported program",
        })

        for student in legacy_students:
            key = (student["year"], student["section"])
            if key not in section_ids:
                section_ids[key] = _legacy_uuid(
                    f"academic-section:{key!r}"
                )
        bind.execute(sa.text(
            "INSERT INTO academic_sections "
            "(id, program_id, year_level, section_name, academic_year, created_at, updated_at) "
            "VALUES (:id, :program_id, :year_level, :section_name, :academic_year, NULL, NULL)"
        ), [
            {
                "id": section_id,
                "program_id": program_id,
                "year_level": year_level,
                "section_name": section_name,
                # The legacy schema has no academic-year field. Preserve that uncertainty explicitly.
                "academic_year": "legacy-unknown",
            }
            for (year_level, section_name), section_id in section_ids.items()
        ])

        bind.execute(sa.text(
            "INSERT INTO people "
            "(id, first_name, middle_name, last_name, name_extension, contact_number, email, created_at, updated_at) "
            "VALUES (:id, :first_name, :middle_name, :last_name, :name_extension, NULL, NULL, :created_at, :updated_at)"
        ), [
            {
                "id": student["id"],
                "first_name": student["first_name"],
                "middle_name": student["middle_name"],
                "last_name": student["last_name"],
                "name_extension": student["extension"],
                "created_at": student["created_at"],
                "updated_at": student["updated_at"],
            }
            for student in legacy_students
        ])
        bind.execute(sa.text(
            "INSERT INTO attendees (id, person_id, attendee_type, created_at, updated_at) "
            "VALUES (:id, :person_id, 'student', :created_at, :updated_at)"
        ), [
            {
                "id": student["id"],
                "person_id": student["id"],
                "created_at": student["created_at"],
                "updated_at": student["updated_at"],
            }
            for student in legacy_students
        ])
        bind.execute(sa.text(
            "INSERT INTO students (id, person_id, student_number, section_id, created_at, updated_at) "
            "VALUES (:id, :person_id, :student_number, :section_id, :created_at, :updated_at)"
        ), [
            {
                "id": student["id"],
                "person_id": student["id"],
                "student_number": student["student_number"],
                "section_id": section_ids[(student["year"], student["section"])],
                "created_at": student["created_at"],
                "updated_at": student["updated_at"],
            }
            for student in legacy_students
        ])
        credentials = [
            {
                "id": _legacy_uuid(f"nfc-credential:{student['id']}"),
                "attendee_id": student["id"],
                "credential_type": "nfc",
                "credential_value": student["nfc_uid"],
                "is_active": student["nfc_registered"],
                "created_at": student["created_at"],
                "updated_at": student["updated_at"],
            }
            for student in legacy_students
            if student["nfc_uid"] is not None
        ]
        if credentials:
            bind.execute(sa.text(
                "INSERT INTO attendee_credentials "
                "(id, attendee_id, credential_type, credential_value, is_active, created_at, updated_at) "
                "VALUES (:id, :attendee_id, :credential_type, :credential_value, :is_active, :created_at, :updated_at)"
            ), credentials)

    if legacy_events:
        bind.execute(sa.text(
            "INSERT INTO events "
            "(id, event_name, description, event_date, start_time, end_time, attendance_mode, organization_id, status, created_at, updated_at) "
            "VALUES (:id, :event_name, NULL, :event_date, :start_time, :end_time, :attendance_mode, :organization_id, :status, :created_at, :updated_at)"
        ), [
            {
                "id": event["id"],
                "event_name": event["event_name"],
                "event_date": event["event_date"],
                "start_time": event["start_time"],
                "end_time": event["end_time"],
                "attendance_mode": event["attendance_mode"],
                "organization_id": organization_ids[event["organizer"]],
                "status": event["status"],
                "created_at": event["created_at"],
                "updated_at": event["updated_at"],
            }
            for event in legacy_events
        ])

    registrations = {}
    for row in legacy_attendance:
        key = (row["event_id"], row["student_id"])
        registrations[key] = {
            "id": _legacy_uuid(f"registration:{row['event_id']}:{row['student_id']}"),
            "event_id": row["event_id"],
            "attendee_id": row["student_id"],
            "registration_status": "registered",
            "registered_at": None,
            "created_at": None,
            "updated_at": None,
        }
    if registrations:
        bind.execute(sa.text(
            "INSERT INTO event_registrations "
            "(id, event_id, attendee_id, registration_status, registered_at, created_at, updated_at) "
            "VALUES (:id, :event_id, :attendee_id, :registration_status, :registered_at, :created_at, :updated_at)"
        ), list(registrations.values()))


def _restore_legacy_records(bind):
    """Rebuild legacy event and student rows before dropping normalized tables."""
    bind.execute(sa.text(
        "INSERT INTO event "
        "(id, event_name, event_date, start_time, end_time, attendance_mode, organizer, status, created_at, updated_at) "
        "SELECT e.id, e.event_name, e.event_date, e.start_time, e.end_time, e.attendance_mode, "
        "COALESCE(o.name, 'Unknown (normalized event)'), e.status, e.created_at, e.updated_at "
        "FROM events e LEFT JOIN organizations o ON o.id = e.organization_id"
    ))
    bind.execute(sa.text(
        "INSERT INTO student "
        "(id, student_number, first_name, middle_name, last_name, extension, year, section, nfc_uid, nfc_registered, created_at, updated_at) "
        "SELECT s.id, s.student_number, p.first_name, p.middle_name, p.last_name, p.name_extension, "
        "COALESCE(sec.year_level, 'unknown'), COALESCE(sec.section_name, 'unknown'), "
        "cred.credential_value, COALESCE(cred.is_active, FALSE), s.created_at, s.updated_at "
        "FROM students s JOIN people p ON p.id = s.person_id "
        "LEFT JOIN academic_sections sec ON sec.id = s.section_id "
        "LEFT JOIN LATERAL ("
        "  SELECT ac.credential_value, ac.is_active FROM attendee_credentials ac "
        "  JOIN attendees a ON a.id = ac.attendee_id "
        "  WHERE a.person_id = s.person_id AND ac.credential_type = 'nfc' "
        "  ORDER BY ac.is_active DESC, ac.created_at NULLS LAST, ac.id LIMIT 1"
        ") cred ON TRUE"
    ))


def upgrade():
    # Explicitly create new enum types in PostgreSQL if they do not exist
    postgresql.ENUM('student', 'faculty', 'staff', 'parent_guardian', 'guest', name='attendeetype').create(op.get_bind(), checkfirst=True)
    postgresql.ENUM('nfc', 'qr', name='credentialtype').create(op.get_bind(), checkfirst=True)
    postgresql.ENUM('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other', name='relationshiptype').create(op.get_bind(), checkfirst=True)
    postgresql.ENUM('registered', 'cancelled', name='registrationstatus').create(op.get_bind(), checkfirst=True)

    # Ensure 'qr' is in scanmethod enum
    op.execute("ALTER TYPE scanmethod ADD VALUE IF NOT EXISTS 'qr'")

    # 1. academic_programs
    op.create_table(
        'academic_programs',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('program_code', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('program_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_academic_programs_program_code'), 'academic_programs', ['program_code'], unique=True)

    # 2. organizations
    op.create_table(
        'organizations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_organizations_name'), 'organizations', ['name'], unique=True)

    # 3. people
    op.create_table(
        'people',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('first_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('middle_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('last_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('name_extension', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('contact_number', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=True),
        sa.Column('email', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # 4. academic_sections
    op.create_table(
        'academic_sections',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('program_id', sa.Uuid(), nullable=False),
        sa.Column('year_level', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('section_name', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('academic_year', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['program_id'], ['academic_programs.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('program_id', 'year_level', 'section_name', 'academic_year', name='uq_academic_section_program_year_name_ay')
    )

    # 5. attendees
    op.create_table(
        'attendees',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('person_id', sa.Uuid(), nullable=False),
        sa.Column('attendee_type', attendeetype_enum, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['person_id'], ['people.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_attendees_person_id'), 'attendees', ['person_id'], unique=True)

    # 6. events
    op.create_table(
        'events',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('event_name', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('description', sqlmodel.sql.sqltypes.AutoString(length=1000), nullable=True),
        sa.Column('event_date', sqlmodel.sql.sqltypes.AutoString(length=20), nullable=False),
        sa.Column('start_time', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=True),
        sa.Column('end_time', sqlmodel.sql.sqltypes.AutoString(length=10), nullable=True),
        sa.Column('attendance_mode', attendancemode_enum, nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=True),
        sa.Column('status', eventstatus_enum, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_events_event_name'), 'events', ['event_name'], unique=False)

    # 7. attendee_credentials
    op.create_table(
        'attendee_credentials',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('attendee_id', sa.Uuid(), nullable=False),
        sa.Column('credential_type', credentialtype_enum, nullable=False),
        sa.Column('credential_value', sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['attendee_id'], ['attendees.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_attendee_credentials_credential_value'), 'attendee_credentials', ['credential_value'], unique=True)
    op.create_index('ix_attendee_credentials_type_value', 'attendee_credentials', ['credential_type', 'credential_value'], unique=False)

    # 8. event_registrations
    op.create_table(
        'event_registrations',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('event_id', sa.Uuid(), nullable=False),
        sa.Column('attendee_id', sa.Uuid(), nullable=False),
        sa.Column('registration_status', registrationstatus_enum, nullable=False),
        sa.Column('registered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['attendee_id'], ['attendees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['event_id'], ['events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'attendee_id', name='uq_event_attendee_registration')
    )

    # 9. students
    op.create_table(
        'students',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('person_id', sa.Uuid(), nullable=False),
        sa.Column('student_number', sqlmodel.sql.sqltypes.AutoString(length=50), nullable=False),
        sa.Column('section_id', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['person_id'], ['people.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['section_id'], ['academic_sections.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_students_person_id'), 'students', ['person_id'], unique=True)
    op.create_index(op.f('ix_students_student_number'), 'students', ['student_number'], unique=True)

    # 10. attendee_relationships
    op.create_table(
        'attendee_relationships',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('attendee_id', sa.Uuid(), nullable=False),
        sa.Column('related_student_id', sa.Uuid(), nullable=False),
        sa.Column('relationship_type', relationshiptype_enum, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['attendee_id'], ['attendees.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['related_student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('attendee_id', 'related_student_id', name='uq_attendee_student_relationship')
    )

    # Copy every legacy record before changing or dropping the old relationships.
    bind = op.get_bind()
    _copy_legacy_records(bind)

    # Add the new key as nullable, backfill it from each old event/student pair,
    # then enforce NOT NULL only after every row has a valid registration.
    op.add_column('attendance', sa.Column('registration_id', sa.Uuid(), nullable=True))
    op.execute("""
        UPDATE attendance AS a
        SET registration_id = er.id
        FROM event_registrations AS er
        WHERE er.event_id = a.event_id
          AND er.attendee_id = a.student_id
    """)
    missing_registrations = bind.execute(sa.text(
        "SELECT count(*) FROM attendance WHERE registration_id IS NULL"
    )).scalar_one()
    if missing_registrations:
        raise RuntimeError(
            f"Cannot normalize attendance: {missing_registrations} legacy attendance rows "
            "could not be mapped to event registrations."
        )
    op.alter_column('attendance', 'registration_id', nullable=False)

    # Only now remove the old keys. The registration relationship is already populated.
    op.drop_constraint(op.f('attendance_event_id_fkey'), 'attendance', type_='foreignkey')
    op.drop_constraint(op.f('attendance_student_id_fkey'), 'attendance', type_='foreignkey')
    op.drop_constraint(op.f('attendance_scanned_by_fkey'), 'attendance', type_='foreignkey')
    op.drop_constraint(op.f('uq_attendance_event_student'), 'attendance', type_='unique')
    op.drop_column('attendance', 'event_id')
    op.drop_column('attendance', 'student_id')

    op.create_index(op.f('ix_attendance_registration_id'), 'attendance', ['registration_id'], unique=True)
    op.create_foreign_key('attendance_registration_id_fkey', 'attendance', 'event_registrations', ['registration_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key('attendance_scanned_by_fkey', 'attendance', 'user', ['scanned_by'], ['id'], ondelete='SET NULL')

    # 11. attendance_corrections
    op.create_table(
        'attendance_corrections',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('attendance_id', sa.Uuid(), nullable=False),
        sa.Column('corrected_by', sa.Uuid(), nullable=False),
        sa.Column('reason', sqlmodel.sql.sqltypes.AutoString(length=500), nullable=False),
        sa.Column('old_time_in', sa.DateTime(timezone=True), nullable=True),
        sa.Column('new_time_in', sa.DateTime(timezone=True), nullable=True),
        sa.Column('old_time_out', sa.DateTime(timezone=True), nullable=True),
        sa.Column('new_time_out', sa.DateTime(timezone=True), nullable=True),
        sa.Column('old_status', attendancestatus_enum, nullable=True),
        sa.Column('new_status', attendancestatus_enum, nullable=True),
        sa.Column('corrected_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['attendance_id'], ['attendance.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['corrected_by'], ['user.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id')
    )

    # Drop old student and event tables
    op.drop_index(op.f('ix_student_nfc_uid'), table_name='student')
    op.drop_index(op.f('ix_student_student_number'), table_name='student')
    op.drop_table('student')
    op.drop_table('event')


def downgrade():
    # 1. Recreate old event and student tables
    op.create_table(
        'event',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('event_name', sa.VARCHAR(length=255), nullable=False),
        sa.Column('event_date', sa.VARCHAR(length=20), nullable=False),
        sa.Column('start_time', sa.VARCHAR(length=10), nullable=True),
        sa.Column('end_time', sa.VARCHAR(length=10), nullable=True),
        sa.Column('attendance_mode', attendancemode_enum, nullable=False),
        sa.Column('organizer', sa.VARCHAR(length=255), nullable=False),
        sa.Column('status', eventstatus_enum, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='event_pkey')
    )

    op.create_table(
        'student',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('student_number', sa.VARCHAR(length=50), nullable=False),
        sa.Column('first_name', sa.VARCHAR(length=255), nullable=False),
        sa.Column('middle_name', sa.VARCHAR(length=255), nullable=True),
        sa.Column('last_name', sa.VARCHAR(length=255), nullable=False),
        sa.Column('extension', sa.VARCHAR(length=20), nullable=True),
        sa.Column('year', sa.VARCHAR(length=20), nullable=False),
        sa.Column('section', sa.VARCHAR(length=20), nullable=False),
        sa.Column('nfc_uid', sa.VARCHAR(length=64), nullable=True),
        sa.Column('nfc_registered', sa.BOOLEAN(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='student_pkey')
    )
    op.create_index(op.f('ix_student_student_number'), 'student', ['student_number'], unique=True)
    op.create_index(op.f('ix_student_nfc_uid'), 'student', ['nfc_uid'], unique=True)

    # Restore the legacy event/student records before dropping normalized tables.
    bind = op.get_bind()
    _restore_legacy_records(bind)

    # Resolve every attendance row back to a legacy student and event before
    # removing registration_id. Refuse to discard attendance for non-student attendees.
    op.add_column('attendance', sa.Column('student_id', sa.Uuid(), nullable=True))
    op.add_column('attendance', sa.Column('event_id', sa.Uuid(), nullable=True))
    op.execute("""
        UPDATE attendance AS a
        SET event_id = er.event_id,
            student_id = s.id
        FROM event_registrations AS er
        JOIN attendees AS at ON at.id = er.attendee_id
        JOIN students AS s ON s.person_id = at.person_id
        WHERE er.id = a.registration_id
    """)
    unmapped_attendance = bind.execute(sa.text(
        "SELECT count(*) FROM attendance WHERE event_id IS NULL OR student_id IS NULL"
    )).scalar_one()
    if unmapped_attendance:
        raise RuntimeError(
            f"Cannot downgrade safely: {unmapped_attendance} attendance rows do not map "
            "to a legacy student and event."
        )
    op.alter_column('attendance', 'student_id', nullable=False)
    op.alter_column('attendance', 'event_id', nullable=False)

    op.drop_table('attendance_corrections')
    op.drop_constraint('attendance_scanned_by_fkey', 'attendance', type_='foreignkey')
    op.drop_constraint('attendance_registration_id_fkey', 'attendance', type_='foreignkey')
    op.drop_index(op.f('ix_attendance_registration_id'), table_name='attendance')
    op.drop_column('attendance', 'registration_id')
    op.create_foreign_key('attendance_scanned_by_fkey', 'attendance', 'user', ['scanned_by'], ['id'])
    op.create_foreign_key('attendance_student_id_fkey', 'attendance', 'student', ['student_id'], ['id'])
    op.create_foreign_key('attendance_event_id_fkey', 'attendance', 'event', ['event_id'], ['id'])
    op.create_unique_constraint('uq_attendance_event_student', 'attendance', ['event_id', 'student_id'])

    # 3. Drop normalized tables in reverse order
    op.drop_table('attendee_relationships')
    op.drop_index(op.f('ix_students_student_number'), table_name='students')
    op.drop_index(op.f('ix_students_person_id'), table_name='students')
    op.drop_table('students')
    op.drop_table('event_registrations')
    op.drop_index('ix_attendee_credentials_type_value', table_name='attendee_credentials')
    op.drop_index(op.f('ix_attendee_credentials_credential_value'), table_name='attendee_credentials')
    op.drop_table('attendee_credentials')
    op.drop_index(op.f('ix_events_event_name'), table_name='events')
    op.drop_table('events')
    op.drop_index(op.f('ix_attendees_person_id'), table_name='attendees')
    op.drop_table('attendees')
    op.drop_table('academic_sections')
    op.drop_table('people')
    op.drop_index(op.f('ix_organizations_name'), table_name='organizations')
    op.drop_table('organizations')
    op.drop_index(op.f('ix_academic_programs_program_code'), table_name='academic_programs')
    op.drop_table('academic_programs')

    # 4. Drop new enum types
    postgresql.ENUM(name='registrationstatus').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='relationshiptype').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='credentialtype').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='attendeetype').drop(op.get_bind(), checkfirst=True)
