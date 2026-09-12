import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, require_admin
from app.models import (
    Organization,
    OrganizationCreate,
    OrganizationPublic,
    OrganizationsPublic,
    OrganizationUpdate,
    get_datetime_utc,
)

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/", response_model=OrganizationsPublic)
def read_organizations(
    session: SessionDep,
    _current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
) -> Any:
    count_statement = select(func.count()).select_from(Organization)
    statement = select(Organization)

    if search:
        pattern = f"%{search}%"
        count_statement = count_statement.where(col(Organization.name).ilike(pattern))
        statement = statement.where(col(Organization.name).ilike(pattern))

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(Organization.name).asc()).offset(skip).limit(limit)
    )
    organizations = session.exec(statement).all()
    return OrganizationsPublic(
        data=[OrganizationPublic.model_validate(org) for org in organizations],
        count=count,
    )


@router.post(
    "/", response_model=OrganizationPublic, dependencies=[Depends(require_admin)]
)
def create_organization(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    organization_in: OrganizationCreate,
) -> Any:
    existing = session.exec(
        select(Organization).where(Organization.name == organization_in.name)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An organization with this name already exists.",
        )

    organization = Organization.model_validate(organization_in)
    session.add(organization)
    session.commit()
    session.refresh(organization)
    return organization


@router.get("/{organization_id}", response_model=OrganizationPublic)
def read_organization(
    session: SessionDep, _current_user: CurrentUser, organization_id: uuid.UUID
) -> Any:
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    return organization


@router.patch(
    "/{organization_id}",
    response_model=OrganizationPublic,
    dependencies=[Depends(require_admin)],
)
def update_organization(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    organization_id: uuid.UUID,
    organization_in: OrganizationUpdate,
) -> Any:
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    update_dict = organization_in.model_dump(exclude_unset=True)
    if "name" in update_dict and update_dict["name"] != organization.name:
        existing = session.exec(
            select(Organization).where(
                col(Organization.name) == update_dict["name"],
                col(Organization.id) != organization_id,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="An organization with this name already exists.",
            )

    organization.sqlmodel_update(update_dict)
    organization.updated_at = get_datetime_utc()
    session.add(organization)
    session.commit()
    session.refresh(organization)
    return organization


@router.delete("/{organization_id}", dependencies=[Depends(require_admin)])
def delete_organization(
    session: SessionDep, _current_user: CurrentUser, organization_id: uuid.UUID
) -> dict[str, str]:
    organization = session.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    session.delete(organization)
    session.commit()
    return {"message": "Organization deleted successfully"}
