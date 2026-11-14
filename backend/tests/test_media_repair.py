from app.repair_media import original_url, valid_image, source_url


def test_image_repair_limits_original_fallback_to_the_same_owner_upload():
    value = "https://i0.wp.com/cakecity.co.ke/wp-content/uploads/2025/cake.jpg?fit=520%2C520&ssl=1"
    assert original_url(value) == "https://cakecity.co.ke/wp-content/uploads/2025/cake.jpg"
    assert original_url("https://i0.wp.com/other.example/cake.jpg") == "https://i0.wp.com/other.example/cake.jpg"
    assert source_url("https://old.on.expo.app/__cakecity-review/v1/app-media/source?url=https%3A%2F%2Fcakecity.co.ke%2Fx.jpg") == "https://cakecity.co.ke/x.jpg"


def test_repair_rejects_html_error_pages_even_with_an_image_content_type():
    assert not valid_image(b"<html>Access denied</html>")
    assert valid_image(b"\x89PNG\r\n\x1a\nrest")
    assert valid_image(b"\x00\x00\x00\x20ftypavifrest")


def test_only_copied_owner_images_are_public_and_upload_restores_listing(system):
    from sqlalchemy.orm import Session
    from app.commerce_models import AppMedia, AppProduct
    s = system
    source = "https://cakecity.co.ke/wp-content/uploads/test-missing.jpg"
    with Session(s['engine']) as db:
        db.add(AppProduct(id=31, slug="photo-hold-cake", enabled=True, price_minor=100000, allocation=2,
                          payload={"id":31,"name":"Photo Hold Cake 2kg","type":"simple","images":[{"src":source}]}))
        db.commit()
    assert 31 not in {p['id'] for p in s['client'].get('/v1/catalogue/products?per_page=100').json()}
    assert 31 not in {p['id'] for p in s['client'].get('/v1/diy/inventory').json()}
    with Session(s['engine']) as db:
        assert db.get(AppProduct,31).enabled
        db.add(AppMedia(id="test-photo", source_url=source, mime="image/png", data=b"\x89PNG\r\n\x1a\nimage"))
        db.commit()
    assert 31 in {p['id'] for p in s['client'].get('/v1/catalogue/products?per_page=100').json()}
    assert 31 in {p['id'] for p in s['client'].get('/v1/diy/inventory').json()}


from test_pesapal import system
