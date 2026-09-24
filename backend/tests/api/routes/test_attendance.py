import concurrent.futures
import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, col, select

from app.core.config import settings
from app.models import Attendance, AttendanceStatus, EventRegistration, UserRole
from tests.utils.user import get_token_headers_for_role
from tests.utils.utils import random_email, random_lower_string


def test_attendance_time_in_only_prevent_duplicate_scan(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event (time_in_only)
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"TimeInOnly Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create Person, Student, Attendee, and NFC Credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "John",
            "last_name": "Doe",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]

    student_num = f"2026-{random_lower_string()[:5].upper()}"
    client.post(
        f"{settings.API_V1_STR}/students/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "student_number": student_num},
    )

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]

    nfc_uid = f"NFC_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "nfc",
            "credential_value": nfc_uid,
            "is_active": True,
        },
    )

    # 3. 1st Scan -> Success (Time-In Recorded)
    scan_1 = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": nfc_uid,
            "scan_method": "nfc",
        },
    )
    assert scan_1.status_code == 200
    res_1 = scan_1.json()
    assert res_1["message"] == "Time-In Recorded"
    assert res_1["person_name"] == "John Doe"
    assert res_1["student_number"] == student_num
    assert res_1["attendance"]["status"] == "present"
    assert res_1["attendance"]["time_in"] is not None
    assert res_1["attendance"]["time_out"] is None

    # 4. 2nd Scan -> 409 Conflict ("Already Recorded")
    scan_2 = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": nfc_uid,
            "scan_method": "nfc",
        },
    )
    assert scan_2.status_code == 409
    assert "Already Recorded" in scan_2.json()["detail"]


def test_attendance_time_in_time_out_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event (time_in_time_out)
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"TwoWay Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_time_out",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create Person, Attendee, and QR Credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Jane",
            "last_name": "Smith",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "faculty"},
    )
    att_id = att_res.json()["id"]

    qr_code = f"QR_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "qr",
            "credential_value": qr_code,
            "is_active": True,
        },
    )

    # 3. 1st Tap -> Time-In Recorded
    scan_1 = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": qr_code,
            "scan_method": "qr",
        },
    )
    assert scan_1.status_code == 200
    res_1 = scan_1.json()
    assert res_1["message"] == "Time-In Recorded"
    assert res_1["attendance"]["status"] == "time_in_only"
    assert res_1["attendance"]["time_in"] is not None
    assert res_1["attendance"]["time_out"] is None

    # 4. 2nd Tap -> Time-Out Recorded
    scan_2 = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": qr_code,
            "scan_method": "qr",
        },
    )
    assert scan_2.status_code == 200
    res_2 = scan_2.json()
    assert res_2["message"] == "Time-Out Recorded"
    assert res_2["attendance"]["status"] == "completed"
    assert res_2["attendance"]["time_in"] is not None
    assert res_2["attendance"]["time_out"] is not None

    # 5. 3rd Tap -> 409 Conflict ("Already Completed")
    scan_3 = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": qr_code,
            "scan_method": "qr",
        },
    )
    assert scan_3.status_code == 409
    assert "Already Completed" in scan_3.json()["detail"]


def test_scan_supported_attendee_types(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # Test scanning across all attendee types: faculty, staff, parent_guardian, guest, student
    types_to_test = ["faculty", "staff", "parent_guardian", "guest", "student"]

    for att_type in types_to_test:
        event_res = client.post(
            f"{settings.API_V1_STR}/events/",
            headers=superuser_token_headers,
            json={
                "event_name": f"{att_type.title()} Event {random_lower_string()[:5]}",
                "event_date": "2026-09-15",
                "attendance_mode": "time_in_only",
                "status": "open",
            },
        )
        event_id = event_res.json()["id"]

        first_name = f"First{random_lower_string()[:4]}"
        last_name = f"Last{random_lower_string()[:4]}"
        p_res = client.post(
            f"{settings.API_V1_STR}/people/",
            headers=superuser_token_headers,
            json={
                "first_name": first_name,
                "last_name": last_name,
                "email": random_email(),
            },
        )
        person_id = p_res.json()["id"]

        student_num = None
        if att_type == "student":
            student_num = f"2026-{random_lower_string()[:5].upper()}"
            client.post(
                f"{settings.API_V1_STR}/students/",
                headers=superuser_token_headers,
                json={"person_id": person_id, "student_number": student_num},
            )

        att_res = client.post(
            f"{settings.API_V1_STR}/attendees/",
            headers=superuser_token_headers,
            json={"person_id": person_id, "attendee_type": att_type},
        )
        att_id = att_res.json()["id"]

        cred_val = f"CRED_{random_lower_string()[:8].upper()}"
        client.post(
            f"{settings.API_V1_STR}/attendee-credentials/",
            headers=superuser_token_headers,
            json={
                "attendee_id": att_id,
                "credential_type": "nfc",
                "credential_value": cred_val,
                "is_active": True,
            },
        )

        scan_res = client.post(
            f"{settings.API_V1_STR}/attendance/scan",
            headers=superuser_token_headers,
            json={
                "event_id": event_id,
                "credential_value": cred_val,
                "scan_method": "nfc",
            },
        )
        assert scan_res.status_code == 200, scan_res.text
        data = scan_res.json()
        assert data["person_name"] == f"{first_name} {last_name}"
        assert data["student_number"] == student_num
        assert data["attendance"]["status"] == "present"


def test_scan_event_eligibility_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create a person, attendee, and active credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Event",
            "last_name": "Tester",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "guest"},
    )
    att_id = att_res.json()["id"]
    cred_val = f"CRED_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "qr",
            "credential_value": cred_val,
            "is_active": True,
        },
    )

    # 2. Nonexistent event -> 404
    non_existent_id = str(uuid.uuid4())
    r_nonexistent = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": non_existent_id,
            "credential_value": cred_val,
            "scan_method": "qr",
        },
    )
    assert r_nonexistent.status_code == 404
    assert "Event not found" in r_nonexistent.json()["detail"]

    # 3. Draft event -> 400
    draft_event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Draft Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "draft",
        },
    ).json()
    r_draft = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": draft_event["id"],
            "credential_value": cred_val,
            "scan_method": "qr",
        },
    )
    assert r_draft.status_code == 400
    assert "not open for attendance scanning" in r_draft.json()["detail"]

    # 4. Closed event -> 400
    closed_event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Closed Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "closed",
        },
    ).json()
    r_closed = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": closed_event["id"],
            "credential_value": cred_val,
            "scan_method": "qr",
        },
    )
    assert r_closed.status_code == 400
    assert "not open for attendance scanning" in r_closed.json()["detail"]


def test_scan_credential_eligibility_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Open Event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Cred Validation Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Nonexistent credential -> 404
    r_nonexistent = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": "NON_EXISTENT_CREDENTIAL_9999",
            "scan_method": "nfc",
        },
    )
    assert r_nonexistent.status_code == 404
    assert "Credential not recognized" in r_nonexistent.json()["detail"]

    # 3. Inactive credential -> 400
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Inactive",
            "last_name": "User",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]
    inactive_cred = f"INACTIVE_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "nfc",
            "credential_value": inactive_cred,
            "is_active": False,
        },
    )

    r_inactive = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": inactive_cred,
            "scan_method": "nfc",
        },
    )
    assert r_inactive.status_code == 400
    assert "Credential is inactive" in r_inactive.json()["detail"]


def test_scan_registration_cancelled_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Cancelled Reg Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create person, attendee, and active credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Cancelled",
            "last_name": "RegUser",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]
    cred_val = f"CRED_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "nfc",
            "credential_value": cred_val,
            "is_active": True,
        },
    )

    # 3. Create EventRegistration with cancelled status
    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "attendee_id": att_id,
            "registration_status": "cancelled",
        },
    )

    # 4. Attempt scan -> 400
    scan_res = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": cred_val,
            "scan_method": "nfc",
        },
    )
    assert scan_res.status_code == 400
    assert "registration is cancelled" in scan_res.json()["detail"]


def test_scan_concurrency_race_condition(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    # 1. Create open event (time_in_only)
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Concurrent Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create person, attendee, and active credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Concurrent",
            "last_name": "Student",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]
    cred_val = f"NFC_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "nfc",
            "credential_value": cred_val,
            "is_active": True,
        },
    )

    # 3. Simulate multi-scanner concurrent requests hitting the scan endpoint simultaneously
    payload = {
        "event_id": event_id,
        "credential_value": cred_val,
        "scan_method": "nfc",
    }

    def do_scan() -> int:
        res = client.post(
            f"{settings.API_V1_STR}/attendance/scan",
            headers=superuser_token_headers,
            json=payload,
        )
        return res.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(do_scan) for _ in range(6)]
        results = [f.result() for f in futures]

    # Exactly one request must succeed (200 OK) and all others must return 409 Conflict
    assert results.count(200) == 1
    assert results.count(409) == 5

    # Verify in DB that only 1 attendance row exists for this registration
    reg = db.exec(
        select(EventRegistration).where(
            col(EventRegistration.event_id) == uuid.UUID(event_id),
            col(EventRegistration.attendee_id) == uuid.UUID(att_id),
        )
    ).first()
    assert reg is not None
    records = db.exec(
        select(Attendance).where(col(Attendance.registration_id) == reg.id)
    ).all()
    assert len(records) == 1


def test_scan_time_out_concurrency(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event (time_in_time_out)
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Concurrent Timeout Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_time_out",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create person, attendee, and active credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Timeout",
            "last_name": "Tester",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "faculty"},
    )
    att_id = att_res.json()["id"]
    cred_val = f"QR_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "qr",
            "credential_value": cred_val,
            "is_active": True,
        },
    )

    payload = {
        "event_id": event_id,
        "credential_value": cred_val,
        "scan_method": "qr",
    }

    # 3. Initial scan (Time-In)
    first_res = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json=payload,
    )
    assert first_res.status_code == 200
    assert first_res.json()["message"] == "Time-In Recorded"

    # 4. Multiple concurrent scanners attempt Time-Out at the exact same moment
    def do_scan() -> int:
        res = client.post(
            f"{settings.API_V1_STR}/attendance/scan",
            headers=superuser_token_headers,
            json=payload,
        )
        return res.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        futures = [executor.submit(do_scan) for _ in range(6)]
        results = [f.result() for f in futures]

    # Exactly one request must complete the time-out (200 OK) and all others must return 409 Conflict
    assert results.count(200) == 1
    assert results.count(409) == 5


def test_scan_rbac_and_accountability(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    # 1. Create open event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"RBAC Scan Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create person, attendee, and credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Scanner",
            "last_name": "Accountability",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]
    cred_val = f"NFC_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "nfc",
            "credential_value": cred_val,
            "is_active": True,
        },
    )

    scan_payload = {
        "event_id": event_id,
        "credential_value": cred_val,
        "scan_method": "nfc",
    }

    # 3. Unauthenticated request -> 401
    r_unauth = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        json=scan_payload,
    )
    assert r_unauth.status_code == 401

    # 4. User without scanner permission (e.g. Student role with can_scan=False) -> 403
    unauth_headers = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=False
    )
    r_forbidden = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=unauth_headers,
        json=scan_payload,
    )
    assert r_forbidden.status_code == 403
    assert "The user does not have scanner permissions" in r_forbidden.json()["detail"]

    # 5. User with can_scan=True (e.g. Student Council Officer / Class Representative with can_scan=True) -> 200
    officer_headers = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=True
    )
    r_authorized = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=officer_headers,
        json=scan_payload,
    )
    assert r_authorized.status_code == 200
    data = r_authorized.json()
    assert data["attendance"]["scanned_by"] is not None


def test_attendance_read_filtering_and_admin_crud(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create open event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"CRUD Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create person, attendee, credential and scan
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "CRUD",
            "last_name": "Attendee",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "staff"},
    )
    att_id = att_res.json()["id"]
    cred_val = f"NFC_{random_lower_string()[:8].upper()}"
    client.post(
        f"{settings.API_V1_STR}/attendee-credentials/",
        headers=superuser_token_headers,
        json={
            "attendee_id": att_id,
            "credential_type": "nfc",
            "credential_value": cred_val,
            "is_active": True,
        },
    )

    scan_res = client.post(
        f"{settings.API_V1_STR}/attendance/scan",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "credential_value": cred_val,
            "scan_method": "nfc",
        },
    )
    assert scan_res.status_code == 200
    rec_id = scan_res.json()["attendance"]["id"]

    # 3. Read attendances with filters
    list_res = client.get(
        f"{settings.API_V1_STR}/attendance/?event_id={event_id}&attendee_id={att_id}",
        headers=superuser_token_headers,
    )
    assert list_res.status_code == 200
    assert list_res.json()["count"] >= 1

    # 4. Read single record
    get_res = client.get(
        f"{settings.API_V1_STR}/attendance/{rec_id}",
        headers=superuser_token_headers,
    )
    assert get_res.status_code == 200
    assert get_res.json()["id"] == rec_id

    # 5. Patch record (admin)
    patch_res = client.patch(
        f"{settings.API_V1_STR}/attendance/{rec_id}",
        headers=superuser_token_headers,
        json={"status": AttendanceStatus.present.value},
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == AttendanceStatus.present.value

    # 6. Delete record (admin)
    del_res = client.delete(
        f"{settings.API_V1_STR}/attendance/{rec_id}",
        headers=superuser_token_headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["message"] == "Attendance record deleted successfully"


def test_manual_scan_time_in_only_for_attendee_without_credential(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event (time_in_only)
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Manual TimeInOnly Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_only",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create Person, Student, Attendee WITHOUT any credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Manual",
            "last_name": "Scan",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]

    student_num = f"2026-{random_lower_string()[:5].upper()}"
    client.post(
        f"{settings.API_V1_STR}/students/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "student_number": student_num},
    )

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]

    # 3. Manual scan (no credential involved) -> Time-In Recorded
    scan_1 = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": event_id, "attendee_id": att_id, "scan_method": "manual"},
    )
    assert scan_1.status_code == 200, scan_1.text
    res_1 = scan_1.json()
    assert res_1["message"] == "Time-In Recorded"
    assert res_1["person_name"] == "Manual Scan"
    assert res_1["student_number"] == student_num
    assert res_1["attendance"]["status"] == "present"
    assert res_1["attendance"]["time_in"] is not None
    assert res_1["attendance"]["time_out"] is None
    assert res_1["attendance"]["scan_method"] == "manual"

    # 4. Duplicate manual scan -> 409 Conflict
    scan_2 = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": event_id, "attendee_id": att_id, "scan_method": "manual"},
    )
    assert scan_2.status_code == 409
    assert "Already Recorded" in scan_2.json()["detail"]


def test_manual_scan_time_in_time_out_lifecycle(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event (time_in_time_out)
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Manual TwoWay Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_time_out",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create Person and Attendee WITHOUT any credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "ManualTime",
            "last_name": "Out",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "faculty"},
    )
    att_id = att_res.json()["id"]

    payload = {"event_id": event_id, "attendee_id": att_id, "scan_method": "manual"}

    # 3. 1st scan -> Time-In Recorded
    scan_1 = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json=payload,
    )
    assert scan_1.status_code == 200
    assert scan_1.json()["message"] == "Time-In Recorded"
    assert scan_1.json()["attendance"]["status"] == "time_in_only"
    assert scan_1.json()["attendance"]["time_out"] is None

    # 4. 2nd scan -> Time-Out Recorded
    scan_2 = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json=payload,
    )
    assert scan_2.status_code == 200
    res_2 = scan_2.json()
    assert res_2["message"] == "Time-Out Recorded"
    assert res_2["attendance"]["status"] == "completed"
    assert res_2["attendance"]["time_in"] is not None
    assert res_2["attendance"]["time_out"] is not None

    # 5. 3rd scan -> 409 Conflict ("Already Completed")
    scan_3 = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json=payload,
    )
    assert scan_3.status_code == 409
    assert "Already Completed" in scan_3.json()["detail"]


def test_manual_scan_eligibility_validation(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Nonexistent event -> 404
    r_nonexistent_event = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": str(uuid.uuid4()), "attendee_id": str(uuid.uuid4())},
    )
    assert r_nonexistent_event.status_code == 404
    assert "Event not found" in r_nonexistent_event.json()["detail"]

    # 2. Create open event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Manual Valid Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 3. Nonexistent attendee -> 404
    r_nonexistent_attendee = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": event_id, "attendee_id": str(uuid.uuid4())},
    )
    assert r_nonexistent_attendee.status_code == 404
    assert "Attendee not found" in r_nonexistent_attendee.json()["detail"]

    # 4. Draft event -> 400
    draft_event = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Manual Draft Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "draft",
        },
    ).json()
    draft_person = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Drafty",
            "last_name": "Attendee",
            "email": random_email(),
        },
    )
    draft_person_id = draft_person.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": draft_person_id, "attendee_type": "guest"},
    )
    att_id = att_res.json()["id"]
    r_draft = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": draft_event["id"], "attendee_id": att_id},
    )
    assert r_draft.status_code == 400
    assert "not open for attendance scanning" in r_draft.json()["detail"]

    # 5. Cancelled registration -> 400
    client.post(
        f"{settings.API_V1_STR}/event-registrations/",
        headers=superuser_token_headers,
        json={
            "event_id": event_id,
            "attendee_id": att_id,
            "registration_status": "cancelled",
        },
    )
    r_cancelled = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": event_id, "attendee_id": att_id},
    )
    assert r_cancelled.status_code == 400
    assert "registration is cancelled" in r_cancelled.json()["detail"]


def test_manual_scan_rbac(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    # 1. Create open event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Manual RBAC Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "status": "open",
        },
    )
    event_id = event_res.json()["id"]

    # 2. Create person and attendee without credential
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "ManualRbac",
            "last_name": "Tester",
            "email": random_email(),
        },
    )
    person_id = p_res.json()["id"]
    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    att_id = att_res.json()["id"]

    payload = {"event_id": event_id, "attendee_id": att_id, "scan_method": "manual"}

    # 3. Unauthenticated -> 401
    r_unauth = client.post(f"{settings.API_V1_STR}/attendance/scan-manual", json=payload)
    assert r_unauth.status_code == 401

    # 4. Role without scanner permission -> 403
    forbidden_headers = get_token_headers_for_role(
        client, db, role=UserRole.student, can_scan=False
    )
    r_forbidden = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=forbidden_headers,
        json=payload,
    )
    assert r_forbidden.status_code == 403
    assert "The user does not have scanner permissions" in r_forbidden.json()["detail"]

    # 5. Role with can_scan=True -> 200 and scanned_by recorded
    officer_headers = get_token_headers_for_role(
        client, db, role=UserRole.class_representative, can_scan=True
    )
    r_authorized = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=officer_headers,
        json=payload,
    )
    assert r_authorized.status_code == 200, r_authorized.text
    assert r_authorized.json()["attendance"]["scanned_by"] is not None


def test_attendance_export_csv(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    # 1. Create Event
    event_res = client.post(
        f"{settings.API_V1_STR}/events/",
        headers=superuser_token_headers,
        json={
            "event_name": f"Export Test Event {random_lower_string()[:5]}",
            "event_date": "2026-09-15",
            "attendance_mode": "time_in_time_out",
            "status": "open",
        },
    )
    assert event_res.status_code == 200
    event_id = event_res.json()["id"]

    # 2. Create Person, Student, Attendee, and Registration
    p_res = client.post(
        f"{settings.API_V1_STR}/people/",
        headers=superuser_token_headers,
        json={
            "first_name": "Export",
            "last_name": "Student",
            "email": random_email(),
        },
    )
    assert p_res.status_code == 200
    person_id = p_res.json()["id"]

    student_num = f"2026-{random_lower_string()[:5].upper()}"
    client.post(
        f"{settings.API_V1_STR}/students/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "student_number": student_num},
    )

    att_res = client.post(
        f"{settings.API_V1_STR}/attendees/",
        headers=superuser_token_headers,
        json={"person_id": person_id, "attendee_type": "student"},
    )
    assert att_res.status_code == 200
    att_id = att_res.json()["id"]

    # 3. Perform manual scan
    scan_res = client.post(
        f"{settings.API_V1_STR}/attendance/scan-manual",
        headers=superuser_token_headers,
        json={"event_id": event_id, "attendee_id": att_id, "scan_method": "manual"},
    )
    assert scan_res.status_code == 200

    # 4. Test Export for this event
    res = client.get(
        f"{settings.API_V1_STR}/attendance/export",
        headers=superuser_token_headers,
        params={"event_id": event_id},
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    csv_content = res.text
    assert "Student Number,Student Name,Event,Time In,Time Out,Attendance Status,Scan Method,Recorded At" in csv_content
    assert student_num in csv_content
    assert "Export Student" in csv_content

