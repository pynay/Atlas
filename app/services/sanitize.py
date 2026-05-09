from lxml import etree

ALLOWED_TAGS = {
    "svg", "g", "defs", "marker", "title", "desc",
    "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
    "text", "tspan", "clipPath", "mask",
    "linearGradient", "radialGradient", "stop",
}

ALLOWED_ATTRS = {
    "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
    "width", "height", "d", "points", "viewBox",
    "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap",
    "stroke-linejoin", "opacity", "fill-opacity", "stroke-opacity",
    "font-family", "font-size", "font-weight", "text-anchor",
    "transform", "id", "class",
    "marker-end", "marker-start", "marker-mid",
    "offset", "stop-color", "stop-opacity",
    "gradientUnits", "gradientTransform",
    "orient", "markerWidth", "markerHeight", "refX", "refY",
    "clip-path", "mask", "preserveAspectRatio",
}


def _localname(qname: str) -> str:
    return qname.rsplit("}", 1)[-1] if "}" in qname else qname


def _scrub(elem: etree._Element) -> None:
    for child in list(elem):
        if not isinstance(child.tag, str):
            elem.remove(child)
            continue
        if _localname(child.tag) not in ALLOWED_TAGS:
            elem.remove(child)
            continue
        _scrub(child)

    for attr in list(elem.attrib):
        local = _localname(attr)
        if local.startswith("on") or local not in ALLOWED_ATTRS:
            del elem.attrib[attr]

    if isinstance(elem.tag, str):
        elem.tag = _localname(elem.tag)


def sanitize_svg(svg_str: str) -> str | None:
    """Parse and scrub SVG. Returns sanitized string, or None if invalid."""
    if not svg_str or not svg_str.strip():
        return None
    try:
        parser = etree.XMLParser(
            resolve_entities=False,
            no_network=True,
            dtd_validation=False,
            load_dtd=False,
            huge_tree=False,
        )
        root = etree.fromstring(svg_str.encode("utf-8"), parser=parser)
    except etree.XMLSyntaxError:
        return None

    if not isinstance(root.tag, str) or _localname(root.tag) != "svg":
        return None

    _scrub(root)
    etree.cleanup_namespaces(root)
    return etree.tostring(root, encoding="unicode")
