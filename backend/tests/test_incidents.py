def test_incident_create_and_list(client, admin_headers):
    payload = {
        "category": "fire",
        "title": "Test fire",
        "description": "Smoke seen near market",
        "latitude": 11.2448,
        "longitude": 77.5017,
    }
    resp = client.post("/api/incidents/", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    created = resp.json()
    assert created["incident_id"].startswith("FRE-")
    assert created["priority"] == "critical"
    assert created["ai_risk_score"] > 0

    listed = client.get("/api/incidents/", headers=admin_headers)
    assert listed.status_code == 200
    ids = [i["incident_id"] for i in listed.json()["incidents"]]
    assert created["incident_id"] in ids


def test_incident_stats(client, admin_headers):
    resp = client.get("/api/incidents/stats", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "total" in body
    assert "critical" in body


def test_incident_update_workflow(client, admin_headers):
    created = client.post(
        "/api/incidents/",
        json={"category": "water_leak", "title": "Water Leak", "latitude": 11.2448, "longitude": 77.5017},
        headers=admin_headers,
    ).json()
    inc_id = created["incident_id"]
    resp = client.put(
        f"/api/incidents/{inc_id}",
        json={"status": "resolved"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "resolved"


def test_incident_stats_consistency(client, admin_headers):
    stats = client.get("/api/incidents/stats", headers=admin_headers).json()
    total = stats["total"]
    parts = stats["reported"] + stats["acknowledged"] + stats["in_progress"] + stats["resolved"] + stats["closed"]
    assert total == parts
