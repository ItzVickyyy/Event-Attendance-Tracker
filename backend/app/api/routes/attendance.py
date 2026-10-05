import csv
import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response
from sqlmodel import col, func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
    class_rep_assignment,
    require_admin,
    require_class_rep_assignment,
    require_scanner_permission,
)
from app.models import (
    Attendance,
    AttendanceCreate,
    AttendancePublic,
    AttendanceSession,
    AttendancesPublic,
    AttendanceStatus,
    AttendanceUpdate,
    Attendee,
    UserRole,
    AttendeeCredential,
    AttendeeType,
    Event,
    EventRegistration,
    EventStatus,
    ManualScanRequest,
    Person,
    ScanMethod,
    ScanRequest,
    ScanResponse,
    Student,
    get_datetime_utc,
)
from app.services.attendance_processing import record_registered_attendance
from app.student_academics import StudentEnrollment

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("/", response_model=AttendancesPublic)
def read_attendances(
    session: SessionDep,
    _current_user: CurrentUser,
    registration_id: uuid.UUID | None = None,
    event_id: uuid.UUID | None = None,
    attendee_id: uuid.UUID | None = None,
    attendance_session_id: uuid.UUID | None = None,
    academic_year_id: uuid.UUID | None = None,
    attendance_status: AttendanceStatus | None = None,
    scan_method: ScanMethod | None = None,
    is_late: bool | None = None,
    attendee_type: AttendeeType | None = None,
    section_id: uuid.UUID | None = None,
    session_date: str | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    # Authorization: Class Representatives can only access their assigned section
    if _current_user.role == UserRole.class_representative:
        assignment = require_class_rep_assignment(session, _current_user, academic_year_id)
        section_id = assignment["section_id"]
        academic_year_id = assignment["academic_year_id"]
    count_statement = select(func.count()).select_from(Attendance)
    statement = select(Attendance)
    registration_filter = select(EventRegistration.id)
    has_filter = False
    if registration_id:
        registration_filter = registration_filter.where(
            col(EventRegistration.id) == registration_id
        )
        has_filter = True
    if event_id:
        registration_filter = registration_filter.where(
            col(EventRegistration.event_id) == event_id
        )
        has_filter = True
    if attendee_id:
        registration_filter = registration_filter.where(
            col(EventRegistration.attendee_id) == attendee_id
        )
        has_filter = True
    if attendee_type:
        registration_filter = registration_filter.join(Attendee).where(
            col(Attendee.attendee_type) == attendee_type
        )
        has_filter = True
    if section_id:
        registration_filter = (
            registration_filter.join(Attendee)
            .join(Student, Student.person_id == Attendee.person_id)
            .join(StudentEnrollment, StudentEnrollment.student_id == Student.id)
            .where(col(StudentEnrollment.section_id) == section_id)
        )
        if academic_year_id:
            registration_filter = registration_filter.where(
                col(StudentEnrollment.academic_year_id) == academic_year_id
            )
        has_filter = True
    if has_filter:
        count_statement = count_statement.where(
            col(Attendance.registration_id).in_(registration_filter)
        )
        statement = statement.where(
            col(Attendance.registration_id).in_(registration_filter)
        )
    if attendance_session_id:
        count_statement = count_statement.where(
            col(Attendance.attendance_session_id) == attendance_session_id
        )
        statement = statement.where(
            col(Attendance.attendance_session_id) == attendance_session_id
        )
    if academic_year_id:
        count_statement = count_statement.where(
            col(Attendance.academic_year_id) == academic_year_id
        )
        statement = statement.where(
            col(Attendance.academic_year_id) == academic_year_id
        )
    if session_date:
        session_ids = select(AttendanceSession.id).where(
            col(AttendanceSession.session_date) == session_date
        )
        count_statement = count_statement.where(
            col(Attendance.attendance_session_id).in_(session_ids)
        )
        statement = statement.where(
            col(Attendance.attendance_session_id).in_(session_ids)
        )
    if attendance_status:
        count_statement = count_statement.where(
            col(Attendance.status) == attendance_status
        )
        statement = statement.where(col(Attendance.status) == attendance_status)
    if scan_method:
        count_statement = count_statement.where(
            col(Attendance.scan_method) == scan_method
        )
        statement = statement.where(col(Attendance.scan_method) == scan_method)
    if is_late is not None:
        count_statement = count_statement.where(col(Attendance.is_late) == is_late)
        statement = statement.where(col(Attendance.is_late) == is_late)
    count = session.exec(count_statement).one()
    records = session.exec(
        statement.order_by(col(Attendance.created_at).desc()).offset(skip).limit(limit)
    ).all()
    return AttendancesPublic(
        data=[AttendancePublic.model_validate(r) for r in records], count=count
    )


@router.get("/export")
def export_attendances(
    session: SessionDep,
    _current_user: CurrentUser,
    event_id: uuid.UUID | None = None,
    academic_year_id: uuid.UUID | None = None,
    attendance_status: AttendanceStatus | None = None,
    attendance_session_id: uuid.UUID | None = None,
    scan_method: ScanMethod | None = None,
    session_date: str | None = None,
    attendee_type: AttendeeType | None = None,
    section_id: uuid.UUID | None = None,
    is_late: bool | None = None,
) -> Response:
    """Export attendance records to CSV."""
    if _current_user.role.value == "class_representative":
        assignment = class_rep_assignment(session, _current_user, academic_year_id)
        if not assignment:
            raise HTTPException(status_code=403, detail="No Class Representative assignment found")
        section_id = assignment["section_id"]
        academic_year_id = assignment["academic_year_id"]

    event: Event | None = None
    if event_id:
        event = session.get(Event, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

    statement = (
        select(
            Attendance,
            EventRegistration,
            Event,
            Attendee,
            Person,
            Student,
            AttendanceSession,
        )
        .join(EventRegistration, Attendance.registration_id == EventRegistration.id)
        .join(Event, EventRegistration.event_id == Event.id)
        .join(Attendee, EventRegistration.attendee_id == Attendee.id)
        .join(Person, Attendee.person_id == Person.id)
        .join(
            AttendanceSession, Attendance.attendance_session_id == AttendanceSession.id
        )
        .outerjoin(Student, Student.person_id == Person.id)
    )

    if event_id:
        statement = statement.where(EventRegistration.event_id == event_id)
    if academic_year_id:
        statement = statement.where(Attendance.academic_year_id == academic_year_id)

    if attendance_status:
        statement = statement.where(Attendance.status == attendance_status)
    if attendance_session_id:
        statement = statement.where(
            Attendance.attendance_session_id == attendance_session_id
        )
    if scan_method:
        statement = statement.where(Attendance.scan_method == scan_method)
    if session_date:
        statement = statement.where(AttendanceSession.session_date == session_date)
    if attendee_type:
        statement = statement.where(Attendee.attendee_type == attendee_type)
    if section_id:
        if _current_user.role.value == "class_representative":
            statement = statement.join(
                StudentEnrollment,
                StudentEnrollment.student_id == Student.id,
            ).where(
                StudentEnrollment.section_id == section_id,
                StudentEnrollment.academic_year_id == academic_year_id,
            )
        else:
            statement = statement.where(Student.section_id == section_id)
    if is_late is not None:
        statement = statement.where(Attendance.is_late == is_late)

    statement = statement.order_by(col(Attendance.created_at).desc())
    results = session.exec(statement).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Student Number",
            "Student Name",
            "Event",
            "Time In",
            "Time Out",
            "Attendance Status",
            "Late",
            "Scan Method",
            "Attendance Session",
            "Session Date",
            "Recorded At",
        ]
    )

    for attendance, _reg, ev, _attendee, person, student, attendance_session in results:
        name_parts = [
            person.first_name,
            person.middle_name,
            person.last_name,
            person.name_extension,
        ]
        full_name = " ".join(p for p in name_parts if p) or "Unknown"
        student_no = student.student_number if student else ""
        time_in_str = attendance.time_in.isoformat() if attendance.time_in else ""
        time_out_str = attendance.time_out.isoformat() if attendance.time_out else ""
        recorded_at_str = (
            attendance.created_at.isoformat() if attendance.created_at else ""
        )

        writer.writerow(
            [
                student_no,
                full_name,
                ev.event_name,
                time_in_str,
                time_out_str,
                attendance.status.value
                if hasattr(attendance.status, "value")
                else str(attendance.status),
                "Yes" if attendance.is_late else "No",
                attendance.scan_method.value
                if hasattr(attendance.scan_method, "value")
                else str(attendance.scan_method),
                attendance_session.name,
                attendance_session.session_date,
                recorded_at_str,
            ]
        )

    csv_data = output.getvalue()
    filename_prefix = (
        event.event_name.replace(" ", "_").lower() if event else "all_events"
    )
    filename = f"attendance_{filename_prefix}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/",
    response_model=AttendancePublic,
    dependencies=[Depends(require_scanner_permission)],
)
def create_attendance(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    record_in: AttendanceCreate,
) -> Any:
    registration = session.get(EventRegistration, record_in.registration_id)
    if not registration:
        raise HTTPException(status_code=404, detail="Event registration not found")
    event = session.get(Event, registration.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    record, _message, _result_code = record_registered_attendance(
        session=session,
        event=event,
        registration=registration,
        current_user=current_user,
        scan_method=record_in.scan_method,
        attendance_session_id=record_in.attendance_session_id,
        now=record_in.time_out or record_in.time_in or get_datetime_utc(),
    )
    return record


@router.post(
    "/scan",
    response_model=ScanResponse,
    dependencies=[Depends(require_scanner_permission)],
)
def scan_attendance(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    scan_in: ScanRequest,
    attendance_session_header: str | None = Header(
        default=None, alias="X-Attendance-Session-ID"
    ),
) -> Any:
    event = session.get(Event, scan_in.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status != EventStatus.open:
        raise HTTPException(
            status_code=400,
            detail=f"Event is not open for attendance scanning (current status: {event.status.value})",
        )
    credential = session.exec(
        select(AttendeeCredential).where(
            col(AttendeeCredential.credential_value) == scan_in.credential_value,
        )
    ).first()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not recognized")
    if not credential.is_active:
        raise HTTPException(status_code=400, detail="Credential is inactive")
    if (
        scan_in.scan_method in (ScanMethod.nfc, ScanMethod.qr)
        and credential.credential_type.value != scan_in.scan_method.value
    ):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid credential type for {scan_in.scan_method.value} scan",
        )
    attendee = credential.attendee or session.get(Attendee, credential.attendee_id)
    if not attendee:
        raise HTTPException(
            status_code=404, detail="Attendee not found for this credential"
        )
    person = attendee.person or session.get(Person, attendee.person_id)
    person_name = (
        " ".join(
            p for p in [person.first_name, person.middle_name, person.last_name] if p
        )
        if person
        else "Unknown"
    )
    student = (
        session.exec(select(Student).where(col(Student.person_id) == person.id)).first()
        if person
        else None
    )
    registration = session.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == event.id,
            col(EventRegistration.attendee_id) == attendee.id,
        )
    ).first()
    if not registration:
        raise HTTPException(
            status_code=404, detail="Attendee is not registered for this event"
        )
    session_id = scan_in.attendance_session_id
    if attendance_session_header:
        try:
            session_id = uuid.UUID(attendance_session_header)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid attendance session id")
    record, message, result_code = record_registered_attendance(
        session=session,
        event=event,
        registration=registration,
        current_user=current_user,
        scan_method=scan_in.scan_method,
        attendance_session_id=session_id,
    )
    return ScanResponse(
        message=message,
        result_code=result_code,
        attendance=AttendancePublic.model_validate(record),
        attendee_id=attendee.id,
        person_name=person_name,
        student_number=student.student_number if student else None,
        attendance_session_id=record.attendance_session_id,
    )


@router.post(
    "/scan-manual",
    response_model=ScanResponse,
    dependencies=[Depends(require_scanner_permission)],
)
def scan_attendance_manual(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    scan_in: ManualScanRequest,
    attendance_session_header: str | None = Header(
        default=None, alias="X-Attendance-Session-ID"
    ),
) -> Any:
    event = session.get(Event, scan_in.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.status != EventStatus.open:
        raise HTTPException(
            status_code=400,
            detail=f"Event is not open for attendance scanning (current status: {event.status.value})",
        )
    attendee = session.get(Attendee, scan_in.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")
    person = attendee.person or session.get(Person, attendee.person_id)
    person_name = (
        " ".join(
            p for p in [person.first_name, person.middle_name, person.last_name] if p
        )
        if person
        else "Unknown"
    )
    student = (
        session.exec(select(Student).where(col(Student.person_id) == person.id)).first()
        if person
        else None
    )
    registration = session.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == event.id,
            col(EventRegistration.attendee_id) == attendee.id,
        )
    ).first()
    if not registration:
        raise HTTPException(
            status_code=404, detail="Attendee is not registered for this event"
        )
    session_id = scan_in.attendance_session_id
    if attendance_session_header:
        try:
            session_id = uuid.UUID(attendance_session_header)
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid attendance session id")
    record, message, result_code = record_registered_attendance(
        session=session,
        event=event,
        registration=registration,
        current_user=current_user,
        scan_method=ScanMethod.manual,
        attendance_session_id=session_id,
    )
    return ScanResponse(
        message=message,
        result_code=result_code,
        attendance=AttendancePublic.model_validate(record),
        attendee_id=attendee.id,
        person_name=person_name,
        student_number=student.student_number if student else None,
        attendance_session_id=record.attendance_session_id,
    )


@router.get("/{record_id}", response_model=AttendancePublic)
def read_attendance(
    session: SessionDep, _current_user: CurrentUser, record_id: uuid.UUID
) -> Any:
    record = session.get(Attendance, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    if _current_user.role.value == "class_representative":
        assignment = class_rep_assignment(
            session, _current_user, record.academic_year_id
        )
        if not assignment:
            raise HTTPException(
                status_code=403,
                detail="Attendance record is outside your assigned section",
            )
        allowed = session.execute(
            select(Student.id)
            .join(Attendee, Attendee.person_id == Student.person_id)
            .join(EventRegistration, EventRegistration.attendee_id == Attendee.id)
            .where(
                EventRegistration.id == record.registration_id,
                Student.section_id == assignment["section_id"],
            )
        ).first()
        if not allowed:
            raise HTTPException(status_code=403, detail="Attendance record is outside your assigned section")
    return record


@router.patch(
    "/{record_id}",
    response_model=AttendancePublic,
    dependencies=[Depends(require_admin)],
)
def update_attendance(
    *,
    session: SessionDep,
    _current_user: CurrentUser,
    record_id: uuid.UUID,
    record_in: AttendanceUpdate,
) -> Any:
    record = session.get(Attendance, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    update_dict = record_in.model_dump(exclude_unset=True)
    if "attendance_session_id" in update_dict:
        target = session.get(AttendanceSession, update_dict["attendance_session_id"])
        if not target:
            raise HTTPException(status_code=404, detail="Attendance session not found")
    record.sqlmodel_update(update_dict)
    record.updated_at = get_datetime_utc()
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/{record_id}", dependencies=[Depends(require_admin)])
def delete_attendance(
    session: SessionDep, _current_user: CurrentUser, record_id: uuid.UUID
) -> dict[str, str]:
    record = session.get(Attendance, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    session.delete(record)
    session.commit()
    return {"message": "Attendance record deleted successfully"}
