import csv
import io
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, func, select, update

from app.api.deps import (
    CurrentUser,
    SessionDep,
    require_admin,
    require_scanner_permission,
)
from app.models import (
    Attendance,
    AttendanceCreate,
    AttendanceMode,
    AttendancePublic,
    AttendancesPublic,
    AttendanceStatus,
    AttendanceUpdate,
    Attendee,
    AttendeeCredential,
    Event,
    EventRegistration,
    EventStatus,
    ManualScanRequest,
    Person,
    RegistrationStatus,
    ScanRequest,
    ScanResponse,
    Student,
    get_datetime_utc,
)

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get("/", response_model=AttendancesPublic)
def read_attendances(
    session: SessionDep,
    _current_user: CurrentUser,
    registration_id: uuid.UUID | None = None,
    event_id: uuid.UUID | None = None,
    attendee_id: uuid.UUID | None = None,
    attendance_status: AttendanceStatus | None = None,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    count_statement = select(func.count()).select_from(Attendance)
    statement = select(Attendance)

    if registration_id:
        count_statement = count_statement.where(
            col(Attendance.registration_id) == registration_id
        )
        statement = statement.where(col(Attendance.registration_id) == registration_id)

    if event_id or attendee_id:
        count_statement = count_statement.join(EventRegistration)
        statement = statement.join(EventRegistration)
        if event_id:
            count_statement = count_statement.where(
                col(EventRegistration.event_id) == event_id
            )
            statement = statement.where(col(EventRegistration.event_id) == event_id)
        if attendee_id:
            count_statement = count_statement.where(
                col(EventRegistration.attendee_id) == attendee_id
            )
            statement = statement.where(
                col(EventRegistration.attendee_id) == attendee_id
            )

    if attendance_status:
        count_statement = count_statement.where(
            col(Attendance.status) == attendance_status
        )
        statement = statement.where(col(Attendance.status) == attendance_status)

    count = session.exec(count_statement).one()
    statement = (
        statement.order_by(col(Attendance.created_at).desc()).offset(skip).limit(limit)
    )
    records = session.exec(statement).all()
    return AttendancesPublic(
        data=[AttendancePublic.model_validate(r) for r in records], count=count
    )


@router.get("/export")
def export_attendances(
    session: SessionDep,
    _current_user: CurrentUser,
    event_id: uuid.UUID | None = None,
    attendance_status: AttendanceStatus | None = None,
) -> Response:
    """Export attendance records to CSV."""
    event: Event | None = None
    if event_id:
        event = session.get(Event, event_id)
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

    statement = (
        select(Attendance, EventRegistration, Event, Attendee, Person, Student)
        .join(EventRegistration, Attendance.registration_id == EventRegistration.id)
        .join(Event, EventRegistration.event_id == Event.id)
        .join(Attendee, EventRegistration.attendee_id == Attendee.id)
        .join(Person, Attendee.person_id == Person.id)
        .outerjoin(Student, Student.person_id == Person.id)
    )

    if event_id:
        statement = statement.where(EventRegistration.event_id == event_id)

    if attendance_status:
        statement = statement.where(Attendance.status == attendance_status)

    statement = statement.order_by(col(Attendance.created_at).desc())
    results = session.exec(statement).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Student Number",
        "Student Name",
        "Event",
        "Time In",
        "Time Out",
        "Attendance Status",
        "Scan Method",
        "Recorded At",
    ])

    for attendance, _reg, ev, _attendee, person, student in results:
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

        writer.writerow([
            student_no,
            full_name,
            ev.event_name,
            time_in_str,
            time_out_str,
            attendance.status.value
            if hasattr(attendance.status, "value")
            else str(attendance.status),
            attendance.scan_method.value
            if hasattr(attendance.scan_method, "value")
            else str(attendance.scan_method),
            recorded_at_str,
        ])

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

    if registration.registration_status == RegistrationStatus.cancelled:
        raise HTTPException(
            status_code=400,
            detail="Attendee registration is cancelled for this event",
        )

    event = session.get(Event, registration.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    existing = session.exec(
        select(Attendance).where(
            col(Attendance.registration_id) == record_in.registration_id
        )
    ).first()

    now = get_datetime_utc()

    if existing:
        if event.attendance_mode == AttendanceMode.time_in_only:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already Recorded - Time-In: {existing.time_in}",
            )
        else:
            if existing.time_out is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            if existing.time_in is None:
                raise HTTPException(
                    status_code=400,
                    detail="Time-In Required before Time-Out",
                )
            stmt = (
                update(Attendance)
                .where(
                    col(Attendance.id) == existing.id,
                    col(Attendance.time_out).is_(None),
                )
                .values(
                    time_out=record_in.time_out or now,
                    status=record_in.status or AttendanceStatus.completed,
                    scanned_by=current_user.id,
                    scan_method=record_in.scan_method,
                    updated_at=now,
                )
            )
            result = session.exec(stmt)
            session.commit()
            if result.rowcount == 0:
                session.refresh(existing)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            session.refresh(existing)
            return existing

    record = Attendance(
        registration_id=record_in.registration_id,
        time_in=record_in.time_in or now,
        time_out=record_in.time_out,
        status=(
            record_in.status
            if record_in.status
            else (
                AttendanceStatus.present
                if event.attendance_mode == AttendanceMode.time_in_only
                else AttendanceStatus.time_in_only
            )
        ),
        scan_method=record_in.scan_method,
        scanned_by=current_user.id,
    )
    session.add(record)
    try:
        session.commit()
        session.refresh(record)
        return record
    except IntegrityError:
        session.rollback()
        existing = session.exec(
            select(Attendance).where(
                col(Attendance.registration_id) == record_in.registration_id
            )
        ).first()
        if not existing:
            raise HTTPException(
                status_code=500,
                detail="Failed to record attendance",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Already Recorded - In: {existing.time_in}",
        )


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
) -> Any:
    # 1. Validate Event exists
    event = session.get(Event, scan_in.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # 2. Validate Event is open for scanning
    if event.status != EventStatus.open:
        raise HTTPException(
            status_code=400,
            detail=f"Event is not open for attendance scanning (current status: {event.status.value})",
        )

    # 3. Validate Credential exists
    credential = session.exec(
        select(AttendeeCredential).where(
            col(AttendeeCredential.credential_value) == scan_in.credential_value,
        )
    ).first()
    if not credential:
        raise HTTPException(
            status_code=404,
            detail="Credential not recognized",
        )

    # 4. Validate Credential is active
    if not credential.is_active:
        raise HTTPException(
            status_code=400,
            detail="Credential is inactive",
        )

    # 5. Resolve Attendee
    attendee = credential.attendee or session.get(Attendee, credential.attendee_id)
    if not attendee:
        raise HTTPException(
            status_code=404,
            detail="Attendee not found for this credential",
        )

    # 6. Resolve Person and optional Student details
    person = attendee.person or (
        session.get(Person, attendee.person_id) if attendee.person_id else None
    )
    person_name = f"{person.first_name} {person.last_name}" if person else "Unknown"

    student_number = None
    if person:
        student = session.exec(
            select(Student).where(col(Student.person_id) == person.id)
        ).first()
        if student:
            student_number = student.student_number

    # 7. Validate / obtain EventRegistration
    registration = session.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == event.id,
            col(EventRegistration.attendee_id) == attendee.id,
        )
    ).first()

    if registration:
        if registration.registration_status == RegistrationStatus.cancelled:
            raise HTTPException(
                status_code=400,
                detail="Attendee registration is cancelled for this event",
            )
    else:
        # Auto-register attendee with concurrency handling
        try:
            registration = EventRegistration(
                event_id=event.id,
                attendee_id=attendee.id,
                registration_status=RegistrationStatus.registered,
            )
            session.add(registration)
            session.commit()
            session.refresh(registration)
        except IntegrityError:
            session.rollback()
            registration = session.exec(
                select(EventRegistration).where(
                    col(EventRegistration.event_id) == event.id,
                    col(EventRegistration.attendee_id) == attendee.id,
                )
            ).first()
            if not registration:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve event registration",
                )
            if registration.registration_status == RegistrationStatus.cancelled:
                raise HTTPException(
                    status_code=400,
                    detail="Attendee registration is cancelled for this event",
                )

    # 8. Check Existing Attendance
    existing = session.exec(
        select(Attendance).where(col(Attendance.registration_id) == registration.id)
    ).first()

    now = get_datetime_utc()

    if existing:
        if event.attendance_mode == AttendanceMode.time_in_only:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already Recorded - In: {existing.time_in}",
            )
        else:
            if existing.time_out is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            # Concurrency-safe atomic update for time_out
            stmt = (
                update(Attendance)
                .where(
                    col(Attendance.id) == existing.id,
                    col(Attendance.time_out).is_(None),
                )
                .values(
                    time_out=now,
                    status=AttendanceStatus.completed,
                    scanned_by=current_user.id,
                    scan_method=scan_in.scan_method,
                    updated_at=now,
                )
            )
            result = session.exec(stmt)
            session.commit()
            if result.rowcount == 0:
                session.refresh(existing)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            session.refresh(existing)
            return ScanResponse(
                message="Time-Out Recorded",
                attendance=AttendancePublic.model_validate(existing),
                attendee_id=attendee.id,
                person_name=person_name,
                student_number=student_number,
            )

    # 9. Insert new Attendance record (Time-In) with concurrency handling
    record = Attendance(
        registration_id=registration.id,
        time_in=now,
        status=(
            AttendanceStatus.present
            if event.attendance_mode == AttendanceMode.time_in_only
            else AttendanceStatus.time_in_only
        ),
        scan_method=scan_in.scan_method,
        scanned_by=current_user.id,
    )
    session.add(record)
    try:
        session.commit()
        session.refresh(record)
        return ScanResponse(
            message="Time-In Recorded",
            attendance=AttendancePublic.model_validate(record),
            attendee_id=attendee.id,
            person_name=person_name,
            student_number=student_number,
        )
    except IntegrityError:
        session.rollback()
        # Another concurrent request already inserted the attendance record
        existing = session.exec(
            select(Attendance).where(col(Attendance.registration_id) == registration.id)
        ).first()
        if not existing:
            raise HTTPException(
                status_code=500,
                detail="Failed to record attendance due to concurrent conflict",
            )
        if event.attendance_mode == AttendanceMode.time_in_only:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already Recorded - In: {existing.time_in}",
            )
        else:
            if existing.time_out is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Recorded - In: {existing.time_in}",
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
) -> Any:
    # 1. Validate Event exists
    event = session.get(Event, scan_in.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # 2. Validate Event is open for scanning
    if event.status != EventStatus.open:
        raise HTTPException(
            status_code=400,
            detail=f"Event is not open for attendance scanning (current status: {event.status.value})",
        )

    # 3. Resolve Attendee
    attendee = session.get(Attendee, scan_in.attendee_id)
    if not attendee:
        raise HTTPException(status_code=404, detail="Attendee not found")

    # 4. Resolve Person and optional Student details
    person = attendee.person or (
        session.get(Person, attendee.person_id) if attendee.person_id else None
    )
    person_name = f"{person.first_name} {person.last_name}" if person else "Unknown"

    student_number = None
    if person:
        student = session.exec(
            select(Student).where(col(Student.person_id) == person.id)
        ).first()
        if student:
            student_number = student.student_number

    # 5. Validate / obtain EventRegistration
    registration = session.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == event.id,
            col(EventRegistration.attendee_id) == attendee.id,
        )
    ).first()

    if registration:
        if registration.registration_status == RegistrationStatus.cancelled:
            raise HTTPException(
                status_code=400,
                detail="Attendee registration is cancelled for this event",
            )
    else:
        # Auto-register attendee with concurrency handling
        try:
            registration = EventRegistration(
                event_id=event.id,
                attendee_id=attendee.id,
                registration_status=RegistrationStatus.registered,
            )
            session.add(registration)
            session.commit()
            session.refresh(registration)
        except IntegrityError:
            session.rollback()
            registration = session.exec(
                select(EventRegistration).where(
                    col(EventRegistration.event_id) == event.id,
                    col(EventRegistration.attendee_id) == attendee.id,
                )
            ).first()
            if not registration:
                raise HTTPException(
                    status_code=500,
                    detail="Failed to retrieve event registration",
                )
            if registration.registration_status == RegistrationStatus.cancelled:
                raise HTTPException(
                    status_code=400,
                    detail="Attendee registration is cancelled for this event",
                )

    # 6. Check Existing Attendance
    existing = session.exec(
        select(Attendance).where(col(Attendance.registration_id) == registration.id)
    ).first()

    now = get_datetime_utc()

    if existing:
        if event.attendance_mode == AttendanceMode.time_in_only:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already Recorded - In: {existing.time_in}",
            )
        else:
            if existing.time_out is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            # Concurrency-safe atomic update for time_out
            stmt = (
                update(Attendance)
                .where(
                    col(Attendance.id) == existing.id,
                    col(Attendance.time_out).is_(None),
                )
                .values(
                    time_out=now,
                    status=AttendanceStatus.completed,
                    scanned_by=current_user.id,
                    scan_method=scan_in.scan_method,
                    updated_at=now,
                )
            )
            result = session.exec(stmt)
            session.commit()
            if result.rowcount == 0:
                session.refresh(existing)
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            session.refresh(existing)
            return ScanResponse(
                message="Time-Out Recorded",
                attendance=AttendancePublic.model_validate(existing),
                attendee_id=attendee.id,
                person_name=person_name,
                student_number=student_number,
            )

    # 7. Insert new Attendance record (Time-In) with concurrency handling
    record = Attendance(
        registration_id=registration.id,
        time_in=now,
        status=(
            AttendanceStatus.present
            if event.attendance_mode == AttendanceMode.time_in_only
            else AttendanceStatus.time_in_only
        ),
        scan_method=scan_in.scan_method,
        scanned_by=current_user.id,
    )
    session.add(record)
    try:
        session.commit()
        session.refresh(record)
        return ScanResponse(
            message="Time-In Recorded",
            attendance=AttendancePublic.model_validate(record),
            attendee_id=attendee.id,
            person_name=person_name,
            student_number=student_number,
        )
    except IntegrityError:
        session.rollback()
        # Another concurrent request already inserted the attendance record
        existing = session.exec(
            select(Attendance).where(col(Attendance.registration_id) == registration.id)
        ).first()
        if not existing:
            raise HTTPException(
                status_code=500,
                detail="Failed to record attendance due to concurrent conflict",
            )
        if event.attendance_mode == AttendanceMode.time_in_only:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Already Recorded - In: {existing.time_in}",
            )
        else:
            if existing.time_out is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Completed - In: {existing.time_in} / Out: {existing.time_out}",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Already Recorded - In: {existing.time_in}",
                )


@router.get("/{record_id}", response_model=AttendancePublic)
def read_attendance(
    session: SessionDep, _current_user: CurrentUser, record_id: uuid.UUID
) -> Any:
    record = session.get(Attendance, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Attendance record not found")
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
