from sqlalchemy.orm import Session
from app.commerce_models import AppProduct
from test_pesapal import system


def test_product_search_matches_words_spacing_and_published_flavours(system):
    with Session(system["engine"]) as db:
        cake = db.get(AppProduct, 12)
        cake.slug = "chocolate-mudcake"
        cake.payload = {**cake.payload, "name": "Chocolate MudCake", "categories": [{"id": 229, "name": "Signature Cakes"}],
                        "attributes": [{"name": "Type of Cake", "options": ["Eggless", "With egg"]}]}
        db.add(AppProduct(id=13, slug="black-forest", payload={"id": 13, "name": "Black Forest", "images": [{"src": "https://images.example.com/black-forest.jpg"}], "categories": [{"id": 229, "name": "Signature Cakes"}]}, price_minor=250000, enabled=True, allocation=1))
        db.commit()
    for term, expected in [("chocolate cakes", [12]), ("blackforest", [13]), ("BLACK   FOREST", [13]), ("eggless", [12]), ("vanilla", [])]:
        response = system["client"].get("/v1/catalogue/products", params={"search": term})
        assert response.status_code == 200, response.text
        assert [row["id"] for row in response.json()] == expected
    response = system["client"].get("/v1/catalogue/products", params={"search": "blackforest", "max_price": 100})
    assert response.status_code == 200 and response.json() == []


def test_cold_product_lookup_filters_exact_slug_and_id_before_pagination(system):
    with Session(system["engine"]) as db:
        cake = db.get(AppProduct, 12)
        cake.slug = "chocolate-mudcake"
        db.add(AppProduct(id=13, slug="chocolate-mudcake-special", payload={"id": 13, "name": "Similar cake"}, price_minor=250000, enabled=True, allocation=1))
        db.commit()
    for params in ({"slug": "chocolate-mudcake", "per_page": 1}, {"include": "12", "per_page": 1}):
        response = system["client"].get("/v1/catalogue/products", params=params)
        assert response.status_code == 200, response.text
        assert [row["id"] for row in response.json()] == [12]
    assert system["client"].get("/v1/catalogue/products", params={"slug": "missing"}).json() == []
