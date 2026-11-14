"""Scheduled, discoverable promotions share the existing reserved coupon ledger."""
from datetime import UTC, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import ForeignKey, JSON, String, select
from sqlalchemy.orm import Mapped, mapped_column, Session
from .db import Base, get_db
from .commerce_models import AppCoupon, AppOrder

router = APIRouter(tags=['promotions'])


class PromotionRule(Base):
    __tablename__ = 'app_promotion_rules'
    code: Mapped[str] = mapped_column(ForeignKey('app_coupons.code'), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


def rules(db, code):
    row = db.get(PromotionRule, code)
    return row.payload if row else {}


def active(rule):
    return not rule.get('starts_at') or datetime.fromisoformat(rule['starts_at']) <= datetime.now(UTC)


def eligibility(db, coupon, customer_id):
    rule = rules(db, coupon.code)
    if not active(rule): return False
    from .marketing_crm import matches
    if not matches(db,customer_id,rule.get('segment','all')): return False
    if rule.get('first_order_only') and db.scalar(select(AppOrder.id).where(
            AppOrder.customer_id == customer_id, AppOrder.payment_state == 'completed').limit(1)): return False
    limit = rule.get('per_customer_limit')
    if limit:
        existing = list(db.scalars(select(AppOrder.id).where(AppOrder.customer_id == customer_id,
            AppOrder.coupon_code == coupon.code, AppOrder.state.notin_(['cancelled','payment_failed']),
            ((AppOrder.inventory_state=='reserved') | (AppOrder.payment_state=='completed')))))
        if len(existing) >= limit: return False
    return True


def saving(rule, coupon, subtotal, delivery=0, lines=None):
    base = delivery if rule.get('scope') == 'delivery' else subtotal
    targets = set(rule.get('product_ids', []))
    if targets and rule.get('scope') != 'delivery':
        base = sum(line['line_minor'] for line in (lines or []) if line['product_id'] in targets)
    discount = (base * rule['percentage_bps'] // 10000) if rule.get('discount_type') == 'percentage' else coupon.amount_minor
    cap = rule.get('maximum_minor')
    return max(0, min(base, discount, cap if cap is not None else base))


def offer_view(db, coupon, subtotal=0):
    rule = rules(db, coupon.code)
    return {'code':coupon.code,'title':rule.get('title') or 'A little more celebration',
        'description':rule.get('description',''), 'banner_url':rule.get('banner_url',''), 'amount_minor':coupon.amount_minor,
        'discount_type':rule.get('discount_type','fixed'), 'percentage_bps':rule.get('percentage_bps',0),
        'scope':rule.get('scope','subtotal'), 'maximum_minor':rule.get('maximum_minor'),
        'minimum_minor':coupon.minimum_minor,'expires_at':coupon.expires_at,
        'first_order_only':rule.get('first_order_only',False), 'product_ids':rule.get('product_ids',[]),
        'saving_minor':saving(rule,coupon,subtotal),
        'terms':'One promotion per order. Minimum spend and selected products apply; final savings are confirmed in checkout.'}


@router.get('/v1/promotions')
def published(db: Session = Depends(get_db)):
    now = datetime.now(UTC)
    result=[]
    for coupon in db.scalars(select(AppCoupon).where(AppCoupon.customer_id.is_(None),AppCoupon.enabled.is_(True))):
        rule=rules(db,coupon.code)
        expiry=coupon.expires_at
        if expiry and expiry.tzinfo is None: expiry=expiry.replace(tzinfo=UTC)
        if rule.get('segment','all')!='all' or not rule.get('discoverable') or not active(rule) or (expiry and expiry<=now) or coupon.uses+coupon.reserved>=coupon.usage_limit: continue
        result.append(offer_view(db,coupon))
    return result
