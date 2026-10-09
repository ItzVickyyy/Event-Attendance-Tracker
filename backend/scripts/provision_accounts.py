"""Provision application accounts and class-representative assignments from CSV.

Keep the input CSV outside version control because it contains account identifiers
and initial passwords. See scripts/provision_accounts.example.csv for its columns.
"""

import csv
import logging
import sys
from pathlib import Path

from sqlmodel import Session, select

from app import crud
from app.core.db import engine
from app.models import AcademicSection, UserCreate, UserRole
from app.student_academics import AcademicYear, ClassRepresentativeAssignment

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {
    "email",
    "full_name",
    "password",
    "role",
    "academic_year",
    "section_name",
    "can_scan",
}


def as_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y"}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if len(sys.argv) != 2:
        raise SystemExit(
            "Usage: uv run python scripts/provision_accounts.py <accounts.csv>"
        )

    csv_path = Path(sys.argv[1])
    if not csv_path.is_file():
        raise SystemExit(f"CSV file not found: {csv_path}")

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            raise SystemExit(f"Missing CSV columns: {', '.join(sorted(missing))}")
        rows = list(reader)

    created = 0
    updated = 0
    assignments_created = 0

    # All changes are committed together. Invalid rows raise before commit, so
    # the session rolls back the pending account and assignment changes.
    with Session(engine) as session:
        for line_number, row in enumerate(rows, start=2):
            email = row["email"].strip()
            if not email:
                raise SystemExit(f"CSV row {line_number}: email is required")

            try:
                role = UserRole(row["role"].strip())
            except ValueError as exc:
                allowed = ", ".join(role.value for role in UserRole)
                raise SystemExit(
                    f"CSV row {line_number}: invalid role. Choose one of: {allowed}"
                ) from exc

            academic_year_label = row["academic_year"].strip()
            section_name = row["section_name"].strip()
            academic_year = None
            section = None

            if role == UserRole.class_representative:
                if not academic_year_label or not section_name:
                    raise SystemExit(
                        f"CSV row {line_number}: class representatives require "
                        "academic_year and section_name"
                    )

                academic_year = session.exec(
                    select(AcademicYear).where(
                        AcademicYear.label == academic_year_label
                    )
                ).first()
                if academic_year is None:
                    raise SystemExit(
                        f"CSV row {line_number}: academic year "
                        f"'{academic_year_label}' was not found"
                    )

                # Accept either the stored section name (for example, "A") or
                # its section code (for example, "BSIT 3A").
                matches = session.exec(
                    select(AcademicSection).where(
                        AcademicSection.academic_year_id == academic_year.id,
                        (AcademicSection.section_name == section_name)
                        | (AcademicSection.section_code == section_name),
                    )
                ).all()
                if len(matches) != 1:
                    reason = "not found" if not matches else "ambiguous"
                    raise SystemExit(
                        f"CSV row {line_number}: section '{section_name}' is "
                        f"{reason} for academic year '{academic_year_label}'"
                    )
                section = matches[0]

            user = crud.get_user_by_email(session=session, email=email)
            full_name = row["full_name"].strip() or None
            can_scan = as_bool(row["can_scan"])

            if user is not None:
                user.full_name = full_name or user.full_name
                user.role = role
                user.is_superuser = role == UserRole.super_admin
                user.can_scan = can_scan
                session.add(user)
                updated += 1
            else:
                password = row["password"]
                if not password:
                    raise SystemExit(
                        f"CSV row {line_number}: password is required for new accounts"
                    )
                user = crud.create_user(
                    session=session,
                    user_create=UserCreate(
                        email=email,
                        password=password,
                        full_name=full_name,
                        role=role,
                        can_scan=can_scan,
                        is_superuser=role == UserRole.super_admin,
                        is_developer=False,
                    ),
                    commit=False,
                )
                created += 1

            if academic_year is not None and section is not None:
                assignment = session.exec(
                    select(ClassRepresentativeAssignment).where(
                        ClassRepresentativeAssignment.user_id == user.id,
                        ClassRepresentativeAssignment.academic_year_id
                        == academic_year.id,
                        ClassRepresentativeAssignment.section_id == section.id,
                    )
                ).first()
                if assignment is None:
                    session.add(
                        ClassRepresentativeAssignment(
                            user_id=user.id,
                            academic_year_id=academic_year.id,
                            section_id=section.id,
                        )
                    )
                    assignments_created += 1

        session.commit()

    logger.info(
        "Provisioned accounts: created=%s, updated=%s, assignments_created=%s",
        created,
        updated,
        assignments_created,
    )


if __name__ == "__main__":
    main()
