"""Versioned, app-owned metadata for a remote display; no app-specific fields."""

import re
from urllib.parse import urljoin, urlsplit


def same_origin_url(base, relative):
    if not isinstance(relative, str) or not relative:
        raise ValueError("A manifest URL must be a nonempty string")
    resolved = urljoin(base, relative)
    expected, actual = urlsplit(base), urlsplit(resolved)
    if (
        actual.scheme not in ("http", "https")
        or actual.username
        or actual.password
        or (actual.scheme, actual.netloc) != (expected.scheme, expected.netloc)
    ):
        raise ValueError("Manifest URLs must stay on the manifest origin")
    return resolved


def parse_manifest(document, url):
    if not isinstance(document, dict) or document.get("version") != 1:
        raise ValueError("Unsupported CastKit manifest version")
    if document.get("viewport") != {"width": 480, "height": 320}:
        raise ValueError("This display requires a 480x320 viewport")
    inputs, refresh = document.get("input", {}), document.get("refresh", {})
    attribute = inputs.get("target_attribute", "data-castkit-target")
    if not isinstance(attribute, str) or not re.fullmatch(r"data-[a-z][a-z0-9-]*", attribute):
        raise ValueError("The touch target attribute must be a data attribute")
    age = inputs.get("max_frame_age_ms", 7000)
    fps, heartbeat = refresh.get("max_fps", 10), refresh.get("heartbeat_ms", 2000)
    if not isinstance(age, (int, float)) or not 500 <= age <= 7000:
        raise ValueError("Touch frame age must be 500–7000ms")
    if (
        not isinstance(fps, (int, float))
        or not 1 <= fps <= 20
        or not isinstance(heartbeat, (int, float))
        or not 500 <= heartbeat <= 3000
    ):
        raise ValueError("Refresh requires 1–20fps and a 500–3000ms heartbeat")
    cache = document.get("cache", [])
    # The current WT32 firmware reserves one full-size PSRAM image for feedback.
    if not isinstance(cache, list) or len(cache) > 1:
        raise ValueError("This display supports at most one optimistic cache image")
    cached = cache[0] if cache else None
    if cached is not None and (
        not isinstance(cached, dict)
        or not isinstance(cached.get("id"), str)
        or not cached["id"]
        or not isinstance(cached.get("on_tap"), str)
        or not cached["on_tap"]
    ):
        raise ValueError("A cache entry requires id, url, and on_tap selector")
    ready = document.get("ready_selector")
    if ready is not None and (not isinstance(ready, str) or not ready):
        raise ValueError("ready_selector must be a CSS selector")
    return {
        "url": same_origin_url(url, document.get("page_url")),
        "cache_url": same_origin_url(url, cached.get("url")) if cached else None,
        "loading_selector": cached["on_tap"] if cached else None,
        "ready_selector": ready,
        "target_attribute": attribute,
        "max_frame_age": age / 1000,
        "max_fps": fps,
        "heartbeat_seconds": heartbeat / 1000,
    }
