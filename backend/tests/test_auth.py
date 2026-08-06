def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "healthy"


def test_root(client):
    resp = client.get("/")
    assert resp.status_code == 200


def test_login_success(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@ucrip.gov", "password": "Admin@123456"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "access_token" in body
    assert "refresh_token" in body


def test_login_invalid(client):
    resp = client.post(
        "/api/auth/login",
        json={"email": "admin@ucrip.gov", "password": "wrong-password"},
    )
    assert resp.status_code == 401


def test_unauth_incident_create_rejected(client):
    resp = client.post(
        "/api/incidents/",
        json={"category": "accident", "title": "x", "description": "y"},
    )
    assert resp.status_code in (401, 403)


def test_me(client, admin_headers):
    resp = client.get("/api/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@ucrip.gov"


def test_users_require_auth(client):
    assert client.get("/api/users/").status_code in (401, 403)
