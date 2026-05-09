from app.services.sanitize import sanitize_svg


def test_valid_svg_passes_through():
    src = '<svg viewBox="0 0 10 10"><rect x="1" y="2" width="3" height="4" fill="red"/></svg>'
    out = sanitize_svg(src)
    assert out is not None
    assert "<rect" in out
    assert 'fill="red"' in out


def test_strips_script_tag():
    src = '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect x="0" y="0"/></svg>'
    out = sanitize_svg(src)
    assert out is not None
    assert "script" not in out
    assert "alert" not in out
    assert "<rect" in out


def test_strips_onclick_attribute():
    src = '<svg viewBox="0 0 10 10"><rect x="0" y="0" onclick="bad()"/></svg>'
    out = sanitize_svg(src)
    assert out is not None
    assert "onclick" not in out
    assert "bad" not in out


def test_strips_foreignobject():
    src = '<svg viewBox="0 0 10 10"><foreignObject><div/></foreignObject></svg>'
    out = sanitize_svg(src)
    assert out is not None
    assert "foreignObject" not in out
    assert "<div" not in out


def test_strips_href_attribute():
    src = '<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect/></a></svg>'
    out = sanitize_svg(src)
    assert out is not None
    assert "href" not in out
    assert "javascript" not in out


def test_returns_none_for_malformed():
    assert sanitize_svg("<svg><rect></svg>") is None
    assert sanitize_svg("not xml at all") is None
    assert sanitize_svg("") is None


def test_returns_none_for_non_svg_root():
    assert sanitize_svg("<html><body/></html>") is None


def test_blocks_external_entity():
    src = '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1"><text>&xxe;</text></svg>'
    out = sanitize_svg(src)
    if out is not None:
        assert "/etc/passwd" not in out
        assert "root:" not in out


def test_preserves_path_d():
    src = '<svg viewBox="0 0 10 10"><path d="M 1 1 L 9 9" stroke="black"/></svg>'
    out = sanitize_svg(src)
    assert out is not None
    assert 'd="M 1 1 L 9 9"' in out
