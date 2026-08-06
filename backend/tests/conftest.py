import os
import sys
import pytest
import pytest_asyncio

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_ucrip.db")
os.environ.setdefault("DATABASE_URL_SYNC", "sqlite:///./test_ucrip.db")
os.environ.setdefault("DEBUG", "false")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture
def app():
    from app.main import app
    return app


@pytest.fixture
def client(app):
    from fastapi.testclient import TestClient
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_headers(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@ucrip.gov", "password": "Admin@123456"},
    )
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
