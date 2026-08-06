from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.incident import Incident
from app.models.user import User

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/overview")
async def dashboard_overview(db: AsyncSession = Depends(get_db)):
    total_incidents = (await db.execute(select(func.count(Incident.id)))).scalar() or 0
    active_incidents = (
        await db.execute(
            select(func.count(Incident.id)).where(Incident.status.in_(["reported", "acknowledged", "in_progress"]))
        )
    ).scalar() or 0
    resolved_today = (
        await db.execute(
            select(func.count(Incident.id)).where(
                Incident.status == "resolved",
                Incident.resolved_at >= datetime.now(UTC).replace(hour=0, minute=0, second=0),
            )
        )
    ).scalar() or 0
    critical = (
        await db.execute(
            select(func.count(Incident.id)).where(
                Incident.priority == "critical", Incident.status != "resolved", Incident.status != "closed"
            )
        )
    ).scalar() or 0
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0

    city_health = max(0, min(100, 100 - (active_incidents * 2) - (critical * 10)))
    risk_score = max(0, min(100, (critical * 25) + (active_incidents * 5)))

    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)
    trend_result = await db.execute(
        select(func.date(Incident.created_at), func.count(Incident.id))
        .where(Incident.created_at >= week_ago)
        .group_by(func.date(Incident.created_at))
        .order_by(func.date(Incident.created_at))
    )
    trend_data = [{"date": str(row[0]), "count": row[1]} for row in trend_result.all()]

    category_result = await db.execute(select(Incident.category, func.count(Incident.id)).group_by(Incident.category))
    category_data = [{"category": row[0], "count": row[1]} for row in category_result.all()]

    priority_result = await db.execute(
        select(Incident.priority, func.count(Incident.id))
        .where(Incident.status.in_(["reported", "acknowledged", "in_progress"]))
        .group_by(Incident.priority)
    )
    priority_data = [{"priority": row[0], "count": row[1]} for row in priority_result.all()]

    recent_result = await db.execute(select(Incident).order_by(Incident.created_at.desc()).limit(10))
    recent_incidents = [
        {
            "id": str(inc.id),
            "incident_id": inc.incident_id,
            "category": inc.category,
            "title": inc.title,
            "status": inc.status,
            "priority": inc.priority,
            "location_address": inc.location_address,
            "created_at": str(inc.created_at),
        }
        for inc in recent_result.scalars().all()
    ]

    departments = {
        "emergency_department": {"total": 0, "active": 0, "resolved": 0, "status": "operational"},
        "traffic_department": {"total": 0, "active": 0, "resolved": 0, "status": "operational"},
        "water_department": {"total": 0, "active": 0, "resolved": 0, "status": "operational"},
        "electricity_department": {"total": 0, "active": 0, "resolved": 0, "status": "operational"},
        "disaster_management": {"total": 0, "active": 0, "resolved": 0, "status": "operational"},
    }
    for dept_name in departments:
        dept_total = (
            await db.execute(select(func.count(Incident.id)).where(Incident.assigned_department == dept_name))
        ).scalar() or 0
        dept_active = (
            await db.execute(
                select(func.count(Incident.id)).where(
                    Incident.assigned_department == dept_name,
                    Incident.status.in_(["reported", "acknowledged", "in_progress"]),
                )
            )
        ).scalar() or 0
        departments[dept_name]["total"] = dept_total
        departments[dept_name]["active"] = dept_active
        departments[dept_name]["resolved"] = dept_total - dept_active
        if dept_active > 10:
            departments[dept_name]["status"] = "stressed"
        if dept_active > 20:
            departments[dept_name]["status"] = "critical"

    return {
        "city_health_score": city_health,
        "risk_score": risk_score,
        "total_incidents": total_incidents,
        "active_incidents": active_incidents,
        "resolved_today": resolved_today,
        "critical_incidents": critical,
        "total_users": total_users,
        "trend_data": trend_data,
        "category_data": category_data,
        "priority_data": priority_data,
        "recent_incidents": recent_incidents,
        "departments": departments,
        "ai_insights": [
            {
                "type": "warning",
                "message": f"{critical} critical incidents require immediate attention",
                "severity": "high",
            },
            {
                "type": "info",
                "message": f"{active_incidents} incidents are currently active across all departments",
                "severity": "medium",
            },
            {"type": "success", "message": f"{resolved_today} incidents resolved today", "severity": "low"},
        ],
        "last_updated": str(datetime.now(UTC)),
    }
