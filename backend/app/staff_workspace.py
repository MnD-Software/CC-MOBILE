"""One role-scoped operational overview for the mobile and web staff workspaces."""
from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .app_commerce import utc
from .commerce_models import AppOrder, CommerceIssue, SalesRecord
from .db import get_db
from .logistics import DISPATCH, KITCHEN, MANAGERS, RIDERS
from .logistics_models import LogisticsEvent, LogisticsScope, LogisticsTask, ProductionTask
from .models import AdministrativeEvent, Customer
from .permissions import ROLE_PERMISSIONS
from .routes_club import member

router = APIRouter(tags=["staff-ecosystem"])
KENYA = timezone(timedelta(hours=3))
REPORTERS = MANAGERS | {"executive", "finance", "analyst"}
CONTENT = MANAGERS | {"marketing_manager", "content_manager", "executive", "analyst"}
SALES = {"sales", "corporate_sales", "customer_service"}
OPEN_ORDERS = ("paid", "preparing", "ready", "out_for_delivery")


def staff(actor=Depends(member)):
    if actor.role not in ROLE_PERMISSIONS:
        raise HTTPException(403, "A staff account is required for this workspace.")
    return actor


def modules(role):
    result = [{"id": "overview", "label": "Overview", "href": "/workspace"}]
    def add(identity, label, href="/workspace"):
        result.append({"id": identity, "label": label, "href": href})
    if role in DISPATCH | RIDERS | {"finance"}: add("earnings", "Rider earnings & payments")
    if role in MANAGERS | {"corporate_manager", "corporate_assistant", "corporate_agent", "corporate_sales"}: add("corporate", "Corporate CRM & accounts")
    if role in KITCHEN: add("kitchen", "Kitchen & production", "/kitchen")
    if role in DISPATCH:
        add("dispatch", "Dispatch & delivery", "/dispatch")
        add("riders", "Rider accounts")
    if role in RIDERS: add("rider", "My deliveries", "/rider")
    if role in REPORTERS: add("sales", "Sales intelligence")
    if role in MANAGERS or role == "customer_service": add("orders", "Order desk")
    if role in MANAGERS or role == "customer_service": add("reviews", "Customer satisfaction")
    if role in MANAGERS:
        for identity, label in [("products", "Catalogue management"), ("promotions", "Promotions"),
                                ("payments", "Payments"), ("club", "Customers & Club"),
                                ("delivery", "Checkout & delivery")]: add(identity, label)
    if role in CONTENT: add("campaigns", "Campaign studio")
    if role in MANAGERS | SALES: add("enquiries", "Customer enquiries")
    if role in REPORTERS: add("issues", "Exceptions")
    if role == "admin": add("team", "Team directory")
    if "audit.read" in ROLE_PERMISSIONS.get(role, set()): add("audit", "Audit trail")
    return result


def department(role):
    if role in MANAGERS: return "Command centre"
    if role in KITCHEN: return "Kitchen & production"
    if role in DISPATCH: return "Dispatch & delivery"
    if role in RIDERS: return "Rider workspace"
    if role in REPORTERS: return "Finance & insights"
    if role in CONTENT: return "Brand & campaigns"
    return "Customer operations"


def scoped_orders(actor):
    query = select(AppOrder).outerjoin(ProductionTask, ProductionTask.order_id == AppOrder.id)
    if actor.role not in MANAGERS | REPORTERS:
        plants = select(LogisticsScope.plant).where(LogisticsScope.customer_id == actor.id)
        plant = func.coalesce(ProductionTask.plant, "hq")
        permitted = plant.in_(plants)
        if actor.role in {"production", "head_chef", "dispatch"}:
            permitted = or_(permitted, plant == "hq")
        query = query.where(permitted)
    return query


def card(key, label, value, hint, format="number", change_percent=None):
    return dict(key=key, label=label, value=value, hint=hint, format=format, change_percent=change_percent)


def sales_summary(db, start, end):
    query = select(SalesRecord).where(SalesRecord.channel == "app", SalesRecord.environment == "live",
        SalesRecord.currency == "KES", SalesRecord.occurred_at >= start, SalesRecord.occurred_at < end)
    daily = defaultdict(lambda: {"net_minor": 0, "orders": 0})
    gross = reversed_total = count = 0
    for row in db.scalars(query.execution_options(yield_per=200)):
        gross += row.paid_minor
        reversed_total += row.reversed_minor
        count += 1
        day = utc(row.occurred_at).astimezone(KENYA).date().isoformat()
        daily[day]["net_minor"] += row.paid_minor - row.reversed_minor
        daily[day]["orders"] += 1
    return {"gross_minor": gross, "reversed_minor": reversed_total,
            "net_minor": gross - reversed_total, "orders": count,
            "average_minor": round(gross / count) if count else 0}, daily


@router.get("/v1/staff/overview")
def overview(response: Response, from_date: date | None = None, to_date: date | None = None,
             mode: Literal["live", "simulation"] = "live", actor=Depends(staff), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    now = datetime.now(UTC)
    today = now.astimezone(KENYA).date()
    until = to_date or today
    since = from_date or (until - timedelta(days=6))
    if since > until or (until - since).days >= 93:
        raise HTTPException(422, "Choose a period of 1 to 93 days, with the end on or after the start.")
    start = datetime.combine(since, time.min, KENYA).astimezone(UTC)
    end = datetime.combine(until + timedelta(days=1), time.min, KENYA).astimezone(UTC)
    channel, environment = ("app_test", "sandbox") if mode == "simulation" else ("app", "live")
    result = {"role": actor.role, "department": department(actor.role), "modules": modules(actor.role),
              "generated_at": now.isoformat(), "timezone": "Africa/Nairobi", "currency": "KES", "mode": mode,
              "period": {"from": since.isoformat(), "to": until.isoformat()},
              "kpis": [], "workload": [], "alerts": [], "sales": None, "activity": []}
    # Queue counts represent the current backlog, not only orders created during the chart period.
    if actor.role in KITCHEN | DISPATCH | MANAGERS | RIDERS:
        if actor.role in RIDERS:
            tasks = select(LogisticsTask.status, func.count()).join(AppOrder, AppOrder.id == LogisticsTask.order_id).where(
                LogisticsTask.rider_id == actor.id, AppOrder.channel == channel, AppOrder.environment == environment)
            counts = dict(db.execute(tasks.group_by(LogisticsTask.status)).all())
            delivered = db.scalar(select(func.count(func.distinct(LogisticsTask.id))).join(
                AppOrder, AppOrder.id == LogisticsTask.order_id).join(
                LogisticsEvent,
                LogisticsEvent.task_id == LogisticsTask.id).where(
                LogisticsTask.rider_id == actor.id, AppOrder.channel == channel, AppOrder.environment == environment,
                LogisticsEvent.status == "delivered",
                LogisticsEvent.created_at >= start,
                LogisticsEvent.created_at < end)) or 0
            for key, label, value, hint in [
                ("assigned", "Awaiting collection", sum(counts.get(s, 0) for s in ("assigned", "accepted", "rescheduled")), "Your current assignments"),
                ("moving", "On the road", sum(counts.get(s, 0) for s in ("collected", "in_transit")), "Your active deliveries"),
                ("delivered", "Delivered", delivered, "Completed during the selected period"),
                ("exceptions", "Needs attention", counts.get("failed", 0), "Your delivery exceptions")]:
                result["kpis"].append(card(key, label, value, hint))
            result["workload"] = [{"key": key, "label": key.replace("_", " ").title(), "count": count} for key, count in counts.items()]
        else:
            query = scoped_orders(actor).where(AppOrder.channel == channel, AppOrder.environment == environment,
                AppOrder.payment_state == "completed", AppOrder.state.in_(OPEN_ORDERS))
            visible = query.with_only_columns(AppOrder.state, AppOrder.created_at).subquery()
            counts = dict(db.execute(select(visible.c.state, func.count()).group_by(visible.c.state)).all())
            oldest = db.scalar(select(func.min(visible.c.created_at)))
            oldest = utc(oldest) if oldest else None
            labels = [("paid", "To prepare"), ("preparing", "In the kitchen"), ("ready", "Ready for handover"), ("out_for_delivery", "On the way")]
            result["workload"] = [{"key": key, "label": label, "count": counts.get(key, 0)} for key, label in labels]
            result["kpis"] = [card(key, label, counts.get(key, 0), "Current paid workload in your permitted locations") for key, label in labels]
            if oldest:
                age = max(0, int((now - oldest).total_seconds() / 3600))
                result["alerts"].append({"label": "Oldest open paid order (hours since purchase)", "count": age,
                    "tab": "kitchen" if actor.role in KITCHEN else "dispatch"})
            task_query = select(LogisticsTask).join(AppOrder, AppOrder.id == LogisticsTask.order_id).where(
                AppOrder.channel == channel, AppOrder.environment == environment, LogisticsTask.status.in_(["failed", "rescheduled"]))
            if actor.role not in MANAGERS:
                plants = select(LogisticsScope.plant).where(LogisticsScope.customer_id == actor.id)
                allowed = LogisticsTask.plant.in_(plants)
                if actor.role in {"production", "head_chef", "dispatch"}: allowed = or_(allowed, LogisticsTask.plant == "hq")
                task_query = task_query.where(allowed)
            if actor.role in DISPATCH:
                exceptions = db.scalar(select(func.count()).select_from(task_query.subquery())) or 0
                result["alerts"].append({"label": "Delivery exceptions to review", "count": exceptions, "tab": "dispatch"})
    if actor.role in REPORTERS and mode == "live":
        summary, daily = sales_summary(db, start, end)
        previous, _ = sales_summary(db, start - (end - start), start)
        change = round((summary["net_minor"] - previous["net_minor"]) / abs(previous["net_minor"]) * 100, 1) if previous["net_minor"] else None
        trend = []
        day = since
        while day <= until:
            trend.append({"date": day.isoformat(), **daily[day.isoformat()]})
            day += timedelta(days=1)
        popular = {}
        product_rows = select(AppOrder.snapshot).join(SalesRecord, SalesRecord.reference == AppOrder.reference).where(
            SalesRecord.channel == "app", SalesRecord.environment == "live", SalesRecord.currency == "KES",
            SalesRecord.occurred_at >= start, SalesRecord.occurred_at < end,
            SalesRecord.paid_minor > SalesRecord.reversed_minor, AppOrder.channel == "app", AppOrder.environment == "live")
        for snapshot in db.scalars(product_rows.execution_options(yield_per=100)):
            for line in snapshot.get("lines", []):
                key = str(line.get("product_id", line.get("slug", line.get("name", "Cake"))))
                product = popular.setdefault(key, {"name": str(line.get("name", "Cake")), "quantity": 0, "subtotal_minor": 0})
                product["quantity"] += line.get("quantity", 0)
                product["subtotal_minor"] += line.get("line_minor", 0)
        result["sales"] = {**summary, "previous_net_minor": previous["net_minor"], "change_percent": change,
            "trend": trend, "top_products": sorted(popular.values(), key=lambda p: p["subtotal_minor"], reverse=True)[:6],
            "definition": "App-channel live sales ledger. Net = verified payments minus recorded reversals, attributed to original payment date. Excludes simulation, sandbox and website/Odoo sales. Product subtotals are before order discounts and reversals; fully reversed orders are excluded from top products."}
        result["kpis"] = [card("net_sales", "Net sales", summary["net_minor"], "Selected period / verified live app ledger", "money", change),
            card("orders", "Paid orders", summary["orders"], "Includes purchases with recorded reversals"),
            card("average", "Average order", summary["average_minor"], "Gross paid value / paid orders", "money"),
            card("reversals", "Reversals", summary["reversed_minor"], "Recorded against original purchase period", "money")] + result["kpis"]
        issues = db.scalar(select(func.count()).select_from(CommerceIssue).where(CommerceIssue.channel == "app", CommerceIssue.status == "open")) or 0
        result["alerts"].append({"label": "Open app exceptions (all environments)", "count": issues, "tab": "issues"})
    if actor.role in CONTENT and not result["kpis"]:
        from .models import EditorialContent
        published = drafts = scheduled = 0
        for row in db.scalars(select(EditorialContent).where(EditorialContent.kind == "campaign")):
            payload = row.payload
            if not payload.get("published"):
                drafts += 1
                continue
            begins = datetime.fromisoformat(payload["starts_at"].replace("Z", "+00:00"))
            ends = datetime.fromisoformat(payload["ends_at"].replace("Z", "+00:00"))
            if begins <= now < ends: published += 1
            elif begins > now: scheduled += 1
        result["kpis"] = [card("live_campaigns", "Live campaigns", published, "Published and currently scheduled"),
            card("scheduled", "Scheduled", scheduled, "Published campaigns starting later"),
            card("drafts", "Drafts", drafts, "Unpublished campaign records")]
    if actor.role in SALES:
        from .models import Enquiry
        counts = dict(db.execute(select(Enquiry.status, func.count()).group_by(Enquiry.status)).all())
        result["kpis"] = [card("requests", "Customer requests", sum(counts.values()), "Recorded enquiry queue"),
            card("new", "New requests", counts.get("submitted", 0), "Ready for a team response"),
            card("quoted", "Quoted", counts.get("quoted", 0), "Quotes recorded by your team")]
    if not result["kpis"]:
        result["kpis"] = [card("workspace", "Available modules", len(result["modules"]) - 1, "Your authorized tools are below")]
    if "audit.read" in ROLE_PERMISSIONS.get(actor.role, set()):
        result["activity"] = [{"action": row.action, "reference": row.resource_id, "at": utc(row.created_at).isoformat()}
            for row in db.scalars(select(AdministrativeEvent).order_by(AdministrativeEvent.created_at.desc()).limit(8))]
    return result


@router.get("/v1/staff/team")
def team(response: Response, actor=Depends(staff), db: Session = Depends(get_db)):
    if actor.role != "admin": raise HTTPException(403, "Administrator access required.")
    response.headers["Cache-Control"] = "private, no-store"
    return [{"id": row.id, "name": " ".join([row.first_name, row.last_name]).strip(), "email": row.email, "role": row.role,
             "plants": list(db.scalars(select(LogisticsScope.plant).where(LogisticsScope.customer_id == row.id)))}
        for row in db.scalars(select(Customer).where(Customer.role.in_(ROLE_PERMISSIONS)).order_by(Customer.first_name).limit(500))]
