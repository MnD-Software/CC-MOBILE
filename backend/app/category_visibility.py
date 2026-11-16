"""Reversible merchandising visibility; historical orders remain unchanged."""
import re
from sqlalchemy import select
from .commerce_models import AppPolicy, AppProduct

def custom_category(category):
    return bool(re.search(r'custom(?:ised|ized)?[\s_-]*cakes?', str(category.get('slug', ''))+' '+str(category.get('name', '')), re.I))

def visibility_policies(db):
    return {row.id: row.payload for row in db.scalars(select(AppPolicy).where(AppPolicy.id.like('category:%')))}


def category_enabled(db, category, policies=None):
    if policies is not None:
        payload = policies.get('category:'+str(category.get('id')))
        return bool(payload.get('enabled')) if payload is not None else not custom_category(category)
    row = db.get(AppPolicy, 'category:'+str(category.get('id')))
    return bool(row.payload.get('enabled')) if row else not custom_category(category)

def product_visible(db, product, policies=None):
    parent = db.get(AppProduct, product.parent_id) if product.parent_id else product
    return bool(parent) and all(category_enabled(db, c, policies) for c in parent.payload.get('categories', []) if isinstance(c, dict))

def category_settings(db):
    found = {}
    policies = visibility_policies(db)
    for product in db.scalars(select(AppProduct).where(AppProduct.parent_id.is_(None))):
        for category in product.payload.get('categories', []):
            if isinstance(category, dict) and isinstance(category.get('id'), int):
                payload = policies.get('category:'+str(category['id']), {})
                found[category['id']] = {**category, 'enabled': category_enabled(db, category, policies), 'revision': payload.get('revision', 0)}
    return sorted(found.values(), key=lambda c: c.get('name', ''))
