from fastapi import APIRouter

from app.api.routes import (
    academic_programs,
    academic_sections,
    attendance,
    attendance_corrections,
    attendee_credentials,
    attendee_relationships,
    attendees,
    event_registrations,
    events,
    items,
    login,
    organizations,
    people,
    private,
    students,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(items.router)
api_router.include_router(organizations.router)
api_router.include_router(academic_programs.router)
api_router.include_router(academic_sections.router)
api_router.include_router(people.router)
api_router.include_router(students.router)
api_router.include_router(attendees.router)
api_router.include_router(attendee_credentials.router)
api_router.include_router(attendee_relationships.router)
api_router.include_router(events.router)
api_router.include_router(event_registrations.router)
api_router.include_router(attendance.router)
api_router.include_router(attendance_corrections.router)


if settings.FASTAPI_ENV == "development":
    api_router.include_router(private.router)
