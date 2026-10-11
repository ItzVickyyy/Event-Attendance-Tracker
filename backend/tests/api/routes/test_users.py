import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.core.security import verify_password
from app.models import AcademicSection, User, UserCreate, UserRole
from app.student_academics import AcademicYear, ClassRepresentativeAssignment
from tests.utils.user import create_random_user, get_token_headers_for_role
from tests.utils.utils import random_email, random_lower_string


def test_get_users_superuser_me(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/me", headers=superuser_token_headers)
    current_user = r.json()
    assert current_user
    assert current_user["is_active"] is True
    assert current_user["is_superuser"]
    assert current_user["email"] == settings.FIRST_SUPERUSER


def test_get_users_normal_user_me(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    r = client.get(f"{settings.API_V1_STR}/users/me", headers=normal_user_token_headers)
    current_user = r.json()
    assert current_user
    assert current_user["is_active"] is True
    assert current_user["is_superuser"] is False
    assert current_user["email"] == settings.EMAIL_TEST_USER


def test_create_user_new_email(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    with (
        patch("app.utils.send_email", return_value=None),
        patch("app.core.config.settings.SMTP_HOST", "smtp.example.com"),
        patch("app.core.config.settings.SMTP_USER", "admin@example.com"),
    ):
        username = random_email()
        password = random_lower_string()
        data = {"email": username, "password": password}
        r = client.post(
            f"{settings.API_V1_STR}/users/",
            headers=superuser_token_headers,
            json=data,
        )
        assert 200 <= r.status_code < 300
        created_user = r.json()
        user = crud.get_user_by_email(session=db, email=username)
        assert user
        assert user.email == created_user["email"]


def test_get_existing_user_as_superuser(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.id
    r = client.get(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=superuser_token_headers,
    )
    assert 200 <= r.status_code < 300
    api_user = r.json()
    existing_user = crud.get_user_by_email(session=db, email=username)
    assert existing_user
    assert existing_user.email == api_user["email"]


def test_get_non_existing_user_as_superuser(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.get(
        f"{settings.API_V1_STR}/users/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "User not found"}


def test_get_existing_user_current_user(client: TestClient, db: Session) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.id

    login_data = {
        "username": username,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}

    r = client.get(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=headers,
    )
    assert 200 <= r.status_code < 300
    api_user = r.json()
    existing_user = crud.get_user_by_email(session=db, email=username)
    assert existing_user
    assert existing_user.email == api_user["email"]


def test_get_existing_user_permissions_error(
    db: Session,
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    user = create_random_user(db)

    r = client.get(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403
    assert r.json() == {"detail": "The user doesn't have enough privileges"}


def test_get_non_existing_user_permissions_error(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    user_id = uuid.uuid4()

    r = client.get(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403
    assert r.json() == {"detail": "The user doesn't have enough privileges"}


def test_create_user_existing_username(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    # username = email
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    crud.create_user(session=db, user_create=user_in)
    data = {"email": username, "password": password}
    r = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=superuser_token_headers,
        json=data,
    )
    created_user = r.json()
    assert r.status_code == 400
    assert "_id" not in created_user


def test_create_user_by_normal_user(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    username = random_email()
    password = random_lower_string()
    data = {"email": username, "password": password}
    r = client.post(
        f"{settings.API_V1_STR}/users/",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 403


def test_create_class_representative_requires_assignment_workflow(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    admin_headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.admin,
    )
    for headers in (superuser_token_headers, admin_headers):
        email = random_email()
        response = client.post(
            f"{settings.API_V1_STR}/users/",
            headers=headers,
            json={
                "email": email,
                "password": random_lower_string(),
                "role": "class_representative",
            },
        )
        assert response.status_code == 403
        assert "dedicated assignment workflow" in response.json()["detail"]
        assert crud.get_user_by_email(session=db, email=email) is None


def test_user_cannot_be_promoted_to_class_representative_without_assignment(
    client: TestClient,
    db: Session,
) -> None:
    target = create_random_user(db)
    admin_headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.admin,
    )
    super_admin_headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.super_admin,
        is_superuser=True,
    )

    for headers in (admin_headers, super_admin_headers):
        response = client.patch(
            f"{settings.API_V1_STR}/users/{target.id}",
            headers=headers,
            json={"role": UserRole.class_representative.value},
        )
        assert response.status_code == 403
        db.refresh(target)
        assert target.role != UserRole.class_representative


def test_super_admin_can_promote_and_demote_class_representative(
    client: TestClient,
    db: Session,
) -> None:
    target = create_random_user(db)
    headers = get_token_headers_for_role(
        client=client,
        db=db,
        role=UserRole.super_admin,
        is_superuser=True,
    )
    year = db.exec(
        select(AcademicYear).where(AcademicYear.label == "2026-2027")
    ).first()
    assert year is not None
    section = db.exec(
        select(AcademicSection).where(
            AcademicSection.academic_year_id == year.id,
            AcademicSection.section_name == "WMAD 3A",
        )
    ).first()
    assert section is not None

    promoted = client.patch(
        f"{settings.API_V1_STR}/users/{target.id}",
        headers=headers,
        json={
            "role": UserRole.class_representative.value,
            "academic_year_id": str(year.id),
            "section_id": str(section.id),
        },
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["role"] == UserRole.class_representative.value
    assert promoted.json()["can_scan"] is False
    assert promoted.json()["is_superuser"] is False

    assignment = db.exec(
        select(ClassRepresentativeAssignment).where(
            ClassRepresentativeAssignment.user_id == target.id,
            ClassRepresentativeAssignment.academic_year_id == year.id,
        )
    ).first()
    assert assignment is not None
    assert assignment.section_id == section.id

    demoted = client.patch(
        f"{settings.API_V1_STR}/users/{target.id}",
        headers=headers,
        json={"role": UserRole.admin.value, "is_superuser": False},
    )
    assert demoted.status_code == 200, demoted.text
    assert demoted.json()["role"] == UserRole.admin.value
    remaining_assignments = db.exec(
        select(ClassRepresentativeAssignment).where(
            ClassRepresentativeAssignment.user_id == target.id
        )
    ).all()
    assert remaining_assignments == []

    # Keep the shared test database clean. User section references restrict
    # deletion of the academic catalog during session teardown.
    db.refresh(target)
    target.academic_year_id = None
    target.section_id = None
    db.add(target)
    db.commit()


def test_retrieve_users(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    crud.create_user(session=db, user_create=user_in)

    username2 = random_email()
    password2 = random_lower_string()
    user_in2 = UserCreate(email=username2, password=password2)
    crud.create_user(session=db, user_create=user_in2)

    developer_email = random_email()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=developer_email,
            password=random_lower_string(),
            is_developer=True,
        ),
    )

    r = client.get(f"{settings.API_V1_STR}/users/", headers=superuser_token_headers)
    all_users = r.json()

    assert len(all_users["data"]) > 1
    assert all_users["count"] == len(all_users["data"])
    assert all(item["email"] != developer_email for item in all_users["data"])
    for item in all_users["data"]:
        assert "email" in item


def test_update_user_me(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    full_name = "Updated Name"
    email = random_email()
    data = {"full_name": full_name, "email": email}
    r = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 200
    updated_user = r.json()
    assert updated_user["email"] == email
    assert updated_user["full_name"] == full_name

    user_query = select(User).where(User.email == email)
    user_db = db.exec(user_query).first()
    assert user_db
    assert user_db.email == email
    assert user_db.full_name == full_name


def test_update_password_me(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    new_password = random_lower_string()
    data = {
        "current_password": settings.FIRST_SUPERUSER_PASSWORD,
        "new_password": new_password,
    }
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    updated_user = r.json()
    assert updated_user["message"] == "Password updated successfully"

    user_query = select(User).where(User.email == settings.FIRST_SUPERUSER)
    user_db = db.exec(user_query).first()
    assert user_db
    assert user_db.email == settings.FIRST_SUPERUSER
    verified, _ = verify_password(new_password, user_db.hashed_password)
    assert verified

    # Revert to the old password to keep consistency in test
    old_data = {
        "current_password": new_password,
        "new_password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=old_data,
    )
    db.refresh(user_db)

    assert r.status_code == 200
    verified, _ = verify_password(
        settings.FIRST_SUPERUSER_PASSWORD, user_db.hashed_password
    )
    assert verified


def test_update_password_me_incorrect_password(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    new_password = random_lower_string()
    data = {"current_password": new_password, "new_password": new_password}
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 400
    updated_user = r.json()
    assert updated_user["detail"] == "Incorrect password"


def test_update_user_me_email_exists(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    data = {"email": user.email}
    r = client.patch(
        f"{settings.API_V1_STR}/users/me",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "User with this email already exists"


def test_update_password_me_same_password_error(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {
        "current_password": settings.FIRST_SUPERUSER_PASSWORD,
        "new_password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.patch(
        f"{settings.API_V1_STR}/users/me/password",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 400
    updated_user = r.json()
    assert (
        updated_user["detail"] == "New password cannot be the same as the current one"
    )


def test_register_user(client: TestClient, db: Session) -> None:
    username = random_email()
    password = random_lower_string()
    full_name = random_lower_string()
    data = {"email": username, "password": password, "full_name": full_name}
    r = client.post(
        f"{settings.API_V1_STR}/users/signup",
        json=data,
    )
    assert r.status_code == 200
    created_user = r.json()
    assert created_user["email"] == username
    assert created_user["full_name"] == full_name

    user_query = select(User).where(User.email == username)
    user_db = db.exec(user_query).first()
    assert user_db
    assert user_db.email == username
    assert user_db.full_name == full_name
    verified, _ = verify_password(password, user_db.hashed_password)
    assert verified


def test_register_user_already_exists_error(client: TestClient) -> None:
    password = random_lower_string()
    full_name = random_lower_string()
    data = {
        "email": settings.FIRST_SUPERUSER,
        "password": password,
        "full_name": full_name,
    }
    r = client.post(
        f"{settings.API_V1_STR}/users/signup",
        json=data,
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "The user with this email already exists in the system"


def test_update_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    data = {"full_name": "Updated_full_name"}
    r = client.patch(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    updated_user = r.json()

    assert updated_user["full_name"] == "Updated_full_name"

    user_query = select(User).where(User.email == username)
    user_db = db.exec(user_query).first()
    db.refresh(user_db)
    assert user_db
    assert user_db.full_name == "Updated_full_name"


def test_update_user_not_exists(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    data = {"full_name": "Updated_full_name"}
    r = client.patch(
        f"{settings.API_V1_STR}/users/{uuid.uuid4()}",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "The user with this id does not exist in the system"


def test_update_user_email_exists(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    username2 = random_email()
    password2 = random_lower_string()
    user_in2 = UserCreate(email=username2, password=password2)
    user2 = crud.create_user(session=db, user_create=user_in2)

    data = {"email": user2.email}
    r = client.patch(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 409
    assert r.json()["detail"] == "User with this email already exists"


def test_delete_user_me(client: TestClient, db: Session) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.id

    login_data = {
        "username": username,
        "password": password,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}

    r = client.delete(
        f"{settings.API_V1_STR}/users/me",
        headers=headers,
    )
    assert r.status_code == 200
    deleted_user = r.json()
    assert deleted_user["message"] == "User deleted successfully"
    result = db.exec(select(User).where(User.id == user_id)).first()
    assert result is None

    user_query = select(User).where(User.id == user_id)
    user_db = db.exec(user_query).first()
    assert user_db is None


def test_delete_user_me_as_superuser(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.delete(
        f"{settings.API_V1_STR}/users/me",
        headers=superuser_token_headers,
    )
    assert r.status_code == 403
    response = r.json()
    assert response["detail"] == "Super users are not allowed to delete themselves"


def test_delete_user_super_user(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)
    user_id = user.id
    r = client.delete(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    deleted_user = r.json()
    assert deleted_user["message"] == "User deleted successfully"
    result = db.exec(select(User).where(User.id == user_id)).first()
    assert result is None


def test_delete_user_not_found(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    r = client.delete(
        f"{settings.API_V1_STR}/users/{uuid.uuid4()}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json()["detail"] == "User not found"


def test_delete_user_current_super_user_error(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    super_user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)
    assert super_user
    user_id = super_user.id

    r = client.delete(
        f"{settings.API_V1_STR}/users/{user_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "Super users are not allowed to delete themselves"


def test_delete_user_without_privileges(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(email=username, password=password)
    user = crud.create_user(session=db, user_create=user_in)

    r = client.delete(
        f"{settings.API_V1_STR}/users/{user.id}",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "The user doesn't have enough privileges"


def test_super_admin_cannot_deactivate_own_account(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    super_user = crud.get_user_by_email(session=db, email=settings.FIRST_SUPERUSER)
    assert super_user
    response = client.patch(
        f"{settings.API_V1_STR}/users/{super_user.id}",
        headers=superuser_token_headers,
        json={"is_active": False},
    )
    assert response.status_code == 403
    assert (
        response.json()["detail"]
        == "You cannot deactivate your own Super Admin account"
    )
    db.refresh(super_user)
    assert super_user.is_active is True


def test_super_admin_can_create_officer_position_and_account(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    years = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=superuser_token_headers,
    )
    assert years.status_code == 200
    year = next(item for item in years.json()["data"] if item["label"] == "2026-2027")
    sections = client.get(
        f"{settings.API_V1_STR}/academic-registry/sections",
        headers=superuser_token_headers,
        params={"academic_year_id": year["id"]},
    )
    assert sections.status_code == 200
    section = next(
        item
        for item in sections.json()["data"]
        if item["program_code"] == "BSIT" and item["section_name"] == "WMAD 3A"
    )
    position = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": f"Recording Secretary {uuid.uuid4().hex[:6]}"},
    )
    assert position.status_code == 200
    payload = {
        "email": random_email(),
        "student_number": f"OFFICER-{uuid.uuid4().hex[:10].upper()}",
        "first_name": "Juan",
        "middle_initial": "D",
        "last_name": "Dela Cruz",
        "extension": "Jr.",
        "organization": "CCS Student Council",
        "academic_year_id": year["id"],
        "section_id": section["id"],
        "role": "super_admin",
        "position_id": position.json()["id"],
    }
    response = client.post(
        f"{settings.API_V1_STR}/users/officers",
        headers=superuser_token_headers,
        json=payload,
    )
    assert response.status_code == 200
    account = response.json()
    assert account["full_name"] == "Juan D. Dela Cruz Jr."
    assert account["student_number"] == payload["student_number"]
    assert account["organization"] == "CCS Student Council"
    assert account["position_id"] == position.json()["id"]
    assert account["role"] == "super_admin"
    assert account["must_change_password"] is True

    delete_account = client.delete(
        f"{settings.API_V1_STR}/users/{account['id']}",
        headers=superuser_token_headers,
    )
    assert delete_account.status_code == 200
    delete_position = client.delete(
        f"{settings.API_V1_STR}/users/officer-positions/{position.json()['id']}",
        headers=superuser_token_headers,
    )
    assert delete_position.status_code == 200


def test_officer_position_names_are_case_insensitively_unique(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    name = f"Treasurer {uuid.uuid4().hex[:6]}"
    first = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": name},
    )
    assert first.status_code == 200
    duplicate = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": name.swapcase()},
    )
    assert duplicate.status_code == 409


def _officer_academic_context(
    client: TestClient, headers: dict[str, str]
) -> tuple[dict[str, str], dict[str, str]]:
    years_response = client.get(
        f"{settings.API_V1_STR}/academic-registry/academic-years",
        headers=headers,
    )
    assert years_response.status_code == 200
    year = next(
        item for item in years_response.json()["data"] if item["label"] == "2026-2027"
    )
    sections_response = client.get(
        f"{settings.API_V1_STR}/academic-registry/sections",
        headers=headers,
        params={"academic_year_id": year["id"]},
    )
    assert sections_response.status_code == 200
    section = next(
        item
        for item in sections_response.json()["data"]
        if item["program_code"] == "BSIT" and item["section_name"] == "WMAD 3A"
    )
    return year, section


def test_super_admin_can_edit_full_officer_account_details(
    client: TestClient,
    superuser_token_headers: dict[str, str],
) -> None:
    year, section = _officer_academic_context(client, superuser_token_headers)
    position = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": f"Edit Officer {uuid.uuid4().hex[:6]}"},
    )
    assert position.status_code == 200
    original_student_number = f"EDIT-{uuid.uuid4().hex[:10].upper()}"
    created = client.post(
        f"{settings.API_V1_STR}/users/officers",
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "student_number": original_student_number,
            "first_name": "Original",
            "middle_initial": "A",
            "last_name": "Officer",
            "extension": None,
            "organization": "CCS Student Council",
            "academic_year_id": year["id"],
            "section_id": section["id"],
            "role": "admin",
            "position_id": position.json()["id"],
        },
    )
    assert created.status_code == 200
    account = created.json()
    new_student_number = f"UPDATED-{uuid.uuid4().hex[:10].upper()}"
    response = client.patch(
        f"{settings.API_V1_STR}/users/{account['id']}",
        headers=superuser_token_headers,
        json={
            "email": random_email(),
            "student_number": new_student_number,
            "first_name": "Updated",
            "middle_name": "B",
            "last_name": "Officer",
            "name_extension": "Jr.",
            "organization": "Updated Council",
            "academic_year_id": year["id"],
            "section_id": section["id"],
            "role": "super_admin",
            "position_id": position.json()["id"],
        },
    )
    assert response.status_code == 200
    updated = response.json()
    assert updated["student_number"] == new_student_number
    assert updated["first_name"] == "Updated"
    assert updated["middle_name"] == "B"
    assert updated["last_name"] == "Officer"
    assert updated["name_extension"] == "Jr."
    assert updated["full_name"] == "Updated B. Officer Jr."
    assert updated["organization"] == "Updated Council"
    assert updated["role"] == "super_admin"
    assert updated["position_id"] == position.json()["id"]

    deleted = client.delete(
        f"{settings.API_V1_STR}/users/{account['id']}",
        headers=superuser_token_headers,
    )
    assert deleted.status_code == 200
    deleted_position = client.delete(
        f"{settings.API_V1_STR}/users/officer-positions/{position.json()['id']}",
        headers=superuser_token_headers,
    )
    assert deleted_position.status_code == 200


def test_admin_cannot_edit_officer_academic_details(
    client: TestClient,
    db: Session,
) -> None:
    target = create_random_user(db)
    admin_headers = get_token_headers_for_role(
        client=client, db=db, role=UserRole.admin
    )
    response = client.patch(
        f"{settings.API_V1_STR}/users/{target.id}",
        headers=admin_headers,
        json={"student_number": "NOT-ALLOWED"},
    )
    assert response.status_code == 403
    assert (
        response.json()["detail"]
        == "Only a Super Admin can edit officer account details"
    )


def test_super_admin_can_download_officer_import_templates(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    csv_response = client.get(
        f"{settings.API_V1_STR}/users/officers/import/template/csv",
        headers=superuser_token_headers,
    )
    xlsx_response = client.get(
        f"{settings.API_V1_STR}/users/officers/import/template/xlsx",
        headers=superuser_token_headers,
    )
    assert csv_response.status_code == 200
    assert "Student ID" in csv_response.text
    assert xlsx_response.status_code == 200
    assert xlsx_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


def test_officer_import_preview_and_bulk_commit(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    year, section = _officer_academic_context(client, superuser_token_headers)
    position = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": f"Import Treasurer {uuid.uuid4().hex[:6]}"},
    )
    assert position.status_code == 200
    email = random_email()
    student_number = f"IMPORT-{uuid.uuid4().hex[:10].upper()}"
    csv_content = (
        "Student ID,First Name,Middle Initial,Last Name,Extension,Academic Year,"
        "Section,Email,Organization,Role,Position\n"
        f"{student_number},Jamie,Q,Importer,,{year['label']},"
        f"BSIT WMAD 3A,{email},CCS Student Council,Admin,{position.json()['name']}\n"
    )
    preview = client.post(
        f"{settings.API_V1_STR}/users/officers/import/preview",
        headers=superuser_token_headers,
        files={"file": ("officers.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert preview.status_code == 200
    preview_data = preview.json()
    assert preview_data["can_import"] is True
    assert preview_data["valid_rows"] == 1
    assert preview_data["invalid_rows"] == 0
    assert preview_data["rows"][0]["payload"]["section_id"] == section["id"]

    commit = client.post(
        f"{settings.API_V1_STR}/users/officers/import/commit",
        headers=superuser_token_headers,
        json={"rows": [row["payload"] for row in preview_data["rows"]]},
    )
    assert commit.status_code == 200
    assert commit.json()["created_count"] == 1

    account = crud.get_user_by_email(session=db, email=email)
    assert account
    assert account.student_number == student_number
    assert account.must_change_password is True
    delete_account = client.delete(
        f"{settings.API_V1_STR}/users/{account.id}",
        headers=superuser_token_headers,
    )
    assert delete_account.status_code == 200
    delete_position = client.delete(
        f"{settings.API_V1_STR}/users/officer-positions/{position.json()['id']}",
        headers=superuser_token_headers,
    )
    assert delete_position.status_code == 200


def test_officer_import_preview_rejects_invalid_rows_and_unsupported_files(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    unsupported = client.post(
        f"{settings.API_V1_STR}/users/officers/import/preview",
        headers=superuser_token_headers,
        files={"file": ("officers.txt", b"invalid", "text/plain")},
    )
    assert unsupported.status_code == 400

    csv_content = (
        "Student ID,First Name,Middle Initial,Last Name,Extension,Academic Year,"
        "Section,Email,Organization,Role,Position\n"
        "BAD-ID,Jamie,,Importer,,2099-2099,UNKNOWN SECTION,invalid-email,"
        "CCS Student Council,Guest,Unknown Position\n"
    )
    preview = client.post(
        f"{settings.API_V1_STR}/users/officers/import/preview",
        headers=superuser_token_headers,
        files={"file": ("officers.csv", csv_content.encode("utf-8"), "text/csv")},
    )
    assert preview.status_code == 200
    data = preview.json()
    assert data["can_import"] is False
    assert data["invalid_rows"] == 1
    assert data["rows"][0]["payload"] is None
    assert len(data["rows"][0]["errors"]) >= 4


def test_officer_import_commit_rejects_duplicate_student_ids(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    year, section = _officer_academic_context(client, superuser_token_headers)
    position = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": f"Duplicate Import {uuid.uuid4().hex[:6]}"},
    )
    assert position.status_code == 200
    student_number = f"DUPLICATE-{uuid.uuid4().hex[:8].upper()}"
    base = {
        "student_number": student_number,
        "first_name": "Jamie",
        "middle_initial": None,
        "last_name": "Importer",
        "extension": None,
        "organization": "CCS Student Council",
        "academic_year_id": year["id"],
        "section_id": section["id"],
        "role": "admin",
        "position_id": position.json()["id"],
    }
    response = client.post(
        f"{settings.API_V1_STR}/users/officers/import/commit",
        headers=superuser_token_headers,
        json={
            "rows": [
                {**base, "email": random_email()},
                {**base, "email": random_email()},
            ]
        },
    )
    assert response.status_code == 409
    assert "Duplicate Student ID" in response.json()["detail"]
    delete_position = client.delete(
        f"{settings.API_V1_STR}/users/officer-positions/{position.json()['id']}",
        headers=superuser_token_headers,
    )
    assert delete_position.status_code == 200


def test_officer_position_can_be_renamed_deactivated_and_deleted(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    created = client.post(
        f"{settings.API_V1_STR}/users/officer-positions",
        headers=superuser_token_headers,
        json={"name": f"Temporary Position {uuid.uuid4().hex[:6]}"},
    )
    assert created.status_code == 200
    updated = client.patch(
        f"{settings.API_V1_STR}/users/officer-positions/{created.json()['id']}",
        headers=superuser_token_headers,
        json={"name": "Archived Position", "is_active": False},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Archived Position"
    assert updated.json()["is_active"] is False
    deleted = client.delete(
        f"{settings.API_V1_STR}/users/officer-positions/{created.json()['id']}",
        headers=superuser_token_headers,
    )
    assert deleted.status_code == 200
