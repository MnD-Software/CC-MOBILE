"""DIY plaque/candle placement travels with the order to the kitchen."""
import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.app_commerce import Selection
from app.commerce_models import AppOrder
from test_logistics import delivery, actor  # noqa: F401  (fixture re-export)
from test_pesapal import system  # noqa: F401

PLACEMENT = {"plaque": {"x": 0.3, "y": 0.62}, "topper": {"x": 0.45, "y": 0.24}}


def test_selection_accepts_placement_only_for_a_custom_design():
    chosen = Selection(product_id=1, quantity=1, design_colour="#FFF3D6", design_placement=PLACEMENT)
    assert chosen.model_dump()["design_placement"] == PLACEMENT
    with pytest.raises(ValidationError):
        Selection(product_id=1, quantity=1, design_placement=PLACEMENT)
    with pytest.raises(ValidationError):
        Selection(product_id=1, quantity=1, design_colour="#FFF3D6",
                  design_placement={**PLACEMENT, "plaque": {"x": 1.4, "y": 0.5}})
    with pytest.raises(ValidationError):
        Selection(product_id=1, quantity=1, design_colour="#FFF3D6",
                  design_placement={**PLACEMENT, "extra": {"x": 0.1, "y": 0.1}})


def test_kitchen_queue_shows_photo_and_customer_placement(delivery):  # noqa: F811
    with Session(delivery["engine"]) as db:
        order = db.query(AppOrder).filter_by(reference=delivery["reference"]).one()
        line = order.snapshot["lines"][0]
        line["selection"] = {**line["selection"], "design_colour": "#FFF3D6", "design_placement": PLACEMENT}
        flag_modified(order, "snapshot")
        db.commit()
    actor("chef", "production")
    rows = delivery["client"].get("/v1/kitchen/orders").json()
    item = next(r for r in rows if r["reference"] == delivery["reference"])["items"][0]
    assert item["image"] == "https://images.example.com/test-cake.jpg"
    assert item["selection"]["design_placement"] == PLACEMENT
