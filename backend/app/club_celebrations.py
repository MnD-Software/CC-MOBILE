"""One-time, account-scoped achievements from verified loyalty ledger mutations."""
from datetime import UTC, datetime
from uuid import uuid4
from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, select, case
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base

TIERS = [(0, "Silver"), (2000000, "Gold"), (5000000, "Diamond"), (10000000, "Platinum")]


class ClubAchievement(Base):
    __tablename__ = "club_achievements"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    customer_id: Mapped[str] = mapped_column(ForeignKey("customers.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    tier: Mapped[str] = mapped_column(String(30))
    points: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("customer_id", "kind"),)


def earn(db, value, previous_spend, previous_lifetime, earned, reference):
    if earned <= 0:
        return
    awards = []
    from .models import ClubEntry
    if not db.scalar(select(ClubEntry.id).where(ClubEntry.customer_id == value.customer_id, ClubEntry.points > 0).limit(1)):
        awards.append(("first_points", "Silver"))
    awards += [("tier_" + name.lower(), name) for threshold, name in TIERS[1:]
               if previous_spend < threshold <= value.spend_minor]
    for kind, tier in awards:
        if not db.scalar(select(ClubAchievement.id).where(ClubAchievement.customer_id == value.customer_id, ClubAchievement.kind == kind)):
            db.add(ClubAchievement(id=str(uuid4()), customer_id=value.customer_id, kind=kind, tier=tier,
                                  points=earned, reference=reference))


def pending(db, customer_id):
    return [{"id": row.id, "kind": row.kind, "tier": row.tier, "points": row.points, "reference": row.reference}
            for row in db.scalars(select(ClubAchievement).where(ClubAchievement.customer_id == customer_id,
                ClubAchievement.seen_at.is_(None)).order_by(case(
                    (ClubAchievement.kind == "first_points", 0), (ClubAchievement.kind == "tier_gold", 1),
                    (ClubAchievement.kind == "tier_diamond", 2), else_=3), ClubAchievement.created_at, ClubAchievement.id))]
