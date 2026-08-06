from app.api.incidents import calculate_priority, calculate_risk_score, get_department, generate_incident_id


def test_generate_incident_id_prefix():
    assert generate_incident_id("fire").startswith("FRE-")
    assert generate_incident_id("accident").startswith("ACC-")
    assert generate_incident_id("unknown_category").startswith("OTH-")


def test_calculate_priority_critical_categories():
    for cat in ["fire", "gas_leak", "building_collapse", "flood"]:
        assert calculate_priority(cat) == "critical"


def test_calculate_priority_urgent_description():
    assert calculate_priority("water_leak", "PLEASE HELP emergency") == "high"
    assert calculate_priority("water_leak", "normal leak") == "medium"


def test_calculate_risk_score_bounds():
    for cat in ["fire", "accident", "water_leak", "other"]:
        for prio in ["critical", "high", "medium", "low"]:
            score = calculate_risk_score(cat, prio)
            assert 0.0 <= score <= 1.0


def test_get_department_mapping():
    assert get_department("water_leak") == "water_department"
    assert get_department("power_outage") == "electricity_department"
    assert get_department("road_damage") == "traffic_department"
    assert get_department("flood") == "disaster_management"
    assert get_department("fire") == "emergency_department"