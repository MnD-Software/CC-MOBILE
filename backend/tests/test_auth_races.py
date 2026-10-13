from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import engine
from app.main import app
from app.models import RefreshToken
from app.security import rotate_refresh_token, token_hash


def test_refresh_token_cannot_be_rotated_from_a_stale_session():
    with TestClient(app) as client:
        session = client.post('/v1/auth/mobile/register', json={
            'email': f'{uuid4().hex}@example.com', 'password': 'correct-horse-battery-staple',
            'first_name': 'Cake', 'last_name': 'Buyer',
        }).json()
        raw = session['refresh_token']
        with Session(engine) as first, Session(engine) as stale:
            # Both requests read the same unrevoked token before either rotates it.
            record = stale.get(RefreshToken, token_hash(raw))
            assert not record.revoked
            rotate_refresh_token(first, raw)
            with pytest.raises(HTTPException) as failure:
                rotate_refresh_token(stale, raw)
            assert failure.value.status_code == 401


def test_registration_race_returns_conflict_instead_of_server_error(monkeypatch):
    from app import routes_auth
    payload = {
        'email': f'{uuid4().hex}@example.com', 'password': 'correct-horse-battery-staple',
        'first_name': 'Cake', 'last_name': 'Buyer',
    }
    with TestClient(app) as client:
        assert client.post('/v1/auth/mobile/register', json=payload).status_code == 201
        # The preflight email lookup can miss another transaction's new customer.
        monkeypatch.setattr(routes_auth, 'get_by_email', lambda *args: None)
        assert client.post('/v1/auth/mobile/register', json=payload).status_code == 409
