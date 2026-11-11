import smtplib
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import engine
from app.main import app
from app.models import Customer, PasswordResetToken, RefreshToken
from app.notification_models import PushDevice
from app.security import token_hash


def recovery_settings(**overrides):
    return Settings(
        _env_file=None,
        password_recovery_enabled=True,
        smtp_host="smtp.example.test",
        smtp_username="test-user",
        smtp_password="test-password",
        smtp_sender_email="support@example.test",
        **overrides,
    )


def enable_recovery(monkeypatch, **overrides):
    from app import routes_auth

    monkeypatch.setattr(routes_auth, "get_settings", lambda: recovery_settings(**overrides))


def register(client):
    response = client.post(
        "/v1/auth/mobile/register",
        json={
            "email": f"{uuid4().hex}@example.com",
            "password": "original-password-123",
            "first_name": "Cake",
            "last_name": "Buyer",
        },
    )
    assert response.status_code == 201
    return response.json()


def request_reset(client, email):
    return client.post(
        "/v1/auth/forgot-password",
        json={"email": email, "redirect_uri": "cakecity://reset-password"},
    )


def test_recovery_disabled_fails_consistently_without_account_enumeration(monkeypatch):
    from app import routes_auth

    monkeypatch.setattr(
        routes_auth,
        "get_settings",
        lambda: Settings(_env_file=None, password_recovery_enabled=False),
    )
    with TestClient(app) as client:
        existing = register(client)
        responses = [
            request_reset(client, existing["customer"]["email"]),
            request_reset(client, f"{uuid4().hex}@example.com"),
        ]
    assert [response.status_code for response in responses] == [503, 503]
    assert responses[0].json() == responses[1].json()


def test_forgot_password_is_generic_and_throttles_repeated_mail(monkeypatch):
    from app import routes_auth

    enable_recovery(monkeypatch)
    sent = []
    monkeypatch.setattr(routes_auth, "send_reset_email", lambda *args: sent.append(args))
    with TestClient(app) as client:
        account = register(client)
        known = request_reset(client, account["customer"]["email"])
        unknown = request_reset(client, f"{uuid4().hex}@example.com")
        repeated = request_reset(client, account["customer"]["email"])

    assert [known.status_code, unknown.status_code, repeated.status_code] == [202, 202, 202]
    assert known.json() == unknown.json() == repeated.json()
    assert len(sent) == 1
    email, raw_token, digest = sent[0]
    assert email == account["customer"]["email"]
    assert len(raw_token) >= 32
    assert digest == token_hash(raw_token)
    assert raw_token not in digest


def test_new_recovery_link_invalidates_an_older_unexpired_link(monkeypatch):
    from app import routes_auth

    enable_recovery(monkeypatch)
    sent = []
    monkeypatch.setattr(routes_auth, "send_reset_email", lambda *args: sent.append(args))
    with TestClient(app) as client:
        account = register(client)
        assert request_reset(client, account["customer"]["email"]).status_code == 202
        first_token = sent[0][1]
        with Session(engine) as db:
            row = db.get(PasswordResetToken, token_hash(first_token))
            row.created_at = datetime.now(UTC) - timedelta(minutes=20)
            db.commit()
        assert request_reset(client, account["customer"]["email"]).status_code == 202
        second_token = sent[1][1]
        first_use = client.post(
            "/v1/auth/reset-password",
            json={"token": first_token, "password": "new-password-456"},
        )
        second_use = client.post(
            "/v1/auth/reset-password",
            json={"token": second_token, "password": "new-password-456"},
        )

    assert first_use.status_code == 400
    assert second_use.status_code == 204


def test_recovery_rejects_unapproved_redirects():
    with TestClient(app) as client:
        response = client.post(
            "/v1/auth/forgot-password",
            json={
                "email": "buyer@example.test",
                "redirect_uri": "https://attacker.example/reset",
            },
        )
    assert response.status_code == 422


def test_reset_is_single_use_and_revokes_refresh_sessions_and_push_devices(monkeypatch):
    from app import routes_auth

    enable_recovery(monkeypatch)
    sent = []
    monkeypatch.setattr(routes_auth, "send_reset_email", lambda *args: sent.append(args))
    with TestClient(app) as client:
        account = register(client)
        old_refresh = account["refresh_token"]
        with Session(engine) as db:
            device = PushDevice(
                id=str(uuid4()),
                token=f"ExponentPushToken[{uuid4().hex}]",
                customer_id=account["customer"]["id"],
                session_hash=token_hash(old_refresh),
                platform="ios",
                generation=str(uuid4()),
                updated_at=datetime.now(UTC),
            )
            db.add(device)
            db.commit()
            device_id = device.id

        assert request_reset(client, account["customer"]["email"]).status_code == 202
        token = sent[0][1]
        reset = client.post(
            "/v1/auth/reset-password",
            json={"token": token, "password": "new-password-456"},
        )
        replay = client.post(
            "/v1/auth/reset-password",
            json={"token": token, "password": "another-password-789"},
        )
        old_login = client.post(
            "/v1/auth/mobile/login",
            json={"email": account["customer"]["email"], "password": "original-password-123"},
        )
        new_login = client.post(
            "/v1/auth/mobile/login",
            json={"email": account["customer"]["email"], "password": "new-password-456"},
        )
        revoked_refresh = client.post(
            "/v1/auth/mobile/refresh",
            json={"refresh_token": old_refresh},
        )

    assert reset.status_code == 204
    assert replay.status_code == 400
    assert old_login.status_code == 401
    assert new_login.status_code == 200
    assert revoked_refresh.status_code == 401
    with Session(engine) as db:
        assert db.get(PushDevice, device_id).enabled is False
        assert db.scalar(
            select(RefreshToken.revoked).where(RefreshToken.token_hash == token_hash(old_refresh))
        )


def test_expired_reset_token_is_rejected(monkeypatch):
    from app import routes_auth

    enable_recovery(monkeypatch)
    sent = []
    monkeypatch.setattr(routes_auth, "send_reset_email", lambda *args: sent.append(args))
    with TestClient(app) as client:
        account = register(client)
        assert request_reset(client, account["customer"]["email"]).status_code == 202
        raw_token = sent[0][1]
        with Session(engine) as db:
            row = db.get(PasswordResetToken, token_hash(raw_token))
            row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.commit()
        response = client.post(
            "/v1/auth/reset-password",
            json={"token": raw_token, "password": "new-password-456"},
        )
    assert response.status_code == 400


def test_email_delivery_failure_invalidates_token(monkeypatch):
    from app import password_recovery

    monkeypatch.setattr(password_recovery, "get_settings", recovery_settings)
    with Session(engine) as db:
        customer = Customer(
            id=str(uuid4()),
            email=f"{uuid4().hex}@example.com",
            password_hash="irrelevant",
            first_name="Cake",
            last_name="Buyer",
        )
        db.add(customer)
        db.commit()
        email = customer.email
        raw_token, digest = password_recovery.issue_reset_token(db, customer)

    def fail_smtp(*args, **kwargs):
        raise smtplib.SMTPConnectError(421, "connection unavailable")

    monkeypatch.setattr(password_recovery.smtplib, "SMTP", fail_smtp)
    password_recovery.send_reset_email(email, raw_token, digest)
    with Session(engine) as db:
        row = db.get(PasswordResetToken, digest)
        assert row.used_at is not None


def test_reset_email_uses_starttls_and_fixed_app_deep_link(monkeypatch):
    from app import password_recovery

    monkeypatch.setattr(password_recovery, "get_settings", recovery_settings)
    delivered = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            assert (host, port, timeout) == ("smtp.example.test", 587, 10)

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def ehlo(self):
            pass

        def starttls(self, context):
            assert isinstance(context, password_recovery.ssl.SSLContext)

        def login(self, username, password):
            assert (username, password) == ("test-user", "test-password")

        def send_message(self, message):
            delivered.append(message)

    monkeypatch.setattr(password_recovery.smtplib, "SMTP", FakeSMTP)
    raw_token = "one-time-reset-token"
    password_recovery.send_reset_email(
        "buyer@example.test",
        raw_token,
        token_hash(raw_token),
    )

    assert len(delivered) == 1
    message = delivered[0]
    assert message["To"] == "buyer@example.test"
    assert "cakecity://reset-password?token=one-time-reset-token" in message.get_content()
    assert "30 minutes" in message.get_content()
