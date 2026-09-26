"""Provision application accounts and assignments from a local CSV file.

The CSV is intentionally kept outside the repository because it contains account
identifiers and passwords. See scripts/provision_accounts.example.csv for the
expected columns.
"""

import csv
import sys
from pathlib import Path

from sqlmodel import Session, select

from app import crud
from app.account_assignments import OrganizationMembership, UserSectionAssignment
from app.core.db import engine
from app.models import AcademicSection, Organization, UserCreate, UserRole


REQUIRED_COLUMNS = {
    "email",
    "full_name",
    "password",
    "role",
    "position",
    "academic_year",
    "section_name",
    "can_scan",
}


def as_bool(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "y"}


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: uv run python scripts/provision_accounts.py <accounts.csv>")

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

    with Session(engine) as session:
        organization = session.exec(
            select(Organization).where(Organization.name == "CCS Student Council")
        ).first()
        if not organization:
            organization = Organization(
                name="CCS Student Council",
                description="College of Computer Studies Student Council",
            )
            session.add(organization)
            session.commit()
            session.refresh(organization)

        created = 0
        updated = 0
        for row in rows:
            role = UserRole(row["role"].strip())
            email = row["email"].strip()
            user = crud.get_user_by_email(session=session, email=email)

            if user:
                user.full_name = row["full_name"].strip() or user.full_name
                user.role = role
                user.can_scan = as_bool(row["can_scan"])
                session.add(user)
                updated += 1
            else:
                user = crud.create_user(
                    session=session,
                    user_create=UserCreate(
                        email=email,
                        password=row["password"],
                        full_name=row["full_name"].strip() or None,
                        role=role,
                        can_scan=as_bool(row["can_scan"]),
                        is_superuser=role in {UserRole.developer, UserRole.super_admin},
                    ),
                )
                created += 1

            academic_year = row["academic_year"].strip()
            position = row["position"].strip()
            if position:
                existing_membership = session.exec(
                    select(OrganizationMembership).where(
                        OrganizationMembership.user_id == user.id,
                        OrganizationMembership.organization_id == organization.id,
                        OrganizationMembership.academic_year == academic_year,
                        OrganizationMembership.position == position,
                    )
                ).first()
                if not existing_membership:
                    session.add(
                        OrganizationMembership(
                            user_id=user.id,
                            organization_id=organization.id,
                            academic_year=academic_year,
                            position=position,
                        )
                    )

            section_name = row["section_name"].strip()
            if role == UserRole.class_representative and section_name:
                section = session.exec(
                    select(AcademicSection).where(
                        AcademicSection.section_name == section_name,
                        AcademicSection.academic_year == academic_year,
                    )
                ).first()
                if not section:
                    raise SystemExit(
                        f"Section '{section_name}' for academic year '{academic_year}' was not found"
                    )
                existing_assignment = session.exec(
                    select(UserSectionAssignment).where(
                        UserSectionAssignment.user_id == user.id,
                        UserSectionAssignment.section_id == section.id,
                        UserSectionAssignment.academic_year == academic_year,
                    )
                ).first()
                if not existing_assignment:
                    session.add(
                        UserSectionAssignment(
                            user_id=user.id,
                            section_id=section.id,
                            academic_year=academic_year,
                        )
                    )

        session.commit()

    print(f"Provisioned accounts: created={created}, updated={updated}")


if __name__ == "__main__":
    main()
