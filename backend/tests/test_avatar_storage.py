from io import BytesIO

from PIL import Image

from app.auth.avatar_storage import store_avatar


def test_store_avatar_applies_exif_orientation_before_cropping(tmp_path, monkeypatch):
    monkeypatch.setenv("AVATAR_STORAGE_PATH", str(tmp_path))
    source = Image.new("RGB", (80, 40), "red")
    for x in range(40, 80):
        for y in range(40):
            source.putpixel((x, y), (0, 0, 255))

    exif = Image.Exif()
    exif[274] = 6  # Rotate the stored landscape pixels 90° clockwise.
    payload = BytesIO()
    source.save(payload, format="JPEG", quality=100, subsampling=0, exif=exif)

    filename = store_avatar(payload.getvalue())

    with Image.open(tmp_path / filename) as avatar:
        top = avatar.convert("RGB").getpixel((128, 32))
        bottom = avatar.convert("RGB").getpixel((128, 224))

    assert top[0] > top[2]
    assert bottom[2] > bottom[0]
