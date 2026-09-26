from app.api.routes.academic_programs import router as academic_programs_router
from app.api.routes.academic_sections import router as academic_sections_router
from app.api.routes.attendance import router as attendance_router
from app.api.routes.attendance_corrections import (
    router as attendance_corrections_router,
)
from app.api.routes.attendee_credentials import router as attendee_credentials_router
from app.api.routes.attendee_relationships import (
    router as attendee_relationships_router,
)
from app.api.routes.attendees import router as attendees_router
from app.api.routes.event_registrations import router as event_registrations_router
from app.api.routes.events import router as events_router
from app.api.routes.import_batches import router as import_batches_router
from app.api.routes.login import router as login_router
from app.api.routes.organizations import router as organizations_router
from app.api.routes.people import router as people_router
from app.api.routes.private import router as private_router
from app.api.routes.roster import router as roster_router
from app.api.routes.students import router as students_router
from app.api.routes.users import router as users_router
from app.api.routes.utils import router as utils_router

__all__ = [
    "academic_programs_router",
    "academic_sections_router",
    "attendance_router",
    "attendance_corrections_router",
    "attendee_credentials_router",
    "attendee_relationships_router",
    "attendees_router",
    "event_registrations_router",
    "events_router",
    "import_batches_router",
    "login_router",
    "organizations_router",
    "people_router",
    "private_router",
    "roster_router",
    "students_router",
    "users_router",
    "utils_router",
]
