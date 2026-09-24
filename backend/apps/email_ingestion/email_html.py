"""Safe HTML extraction for inbound email display.

Plain-text parsing remains authoritative for ticket logic, search, automation,
threading and manual edits. This module only produces a sanitized presentation
copy for the ticket UI.
"""
from __future__ import annotations

import logging

import bleach
from bleach.css_sanitizer import CSSSanitizer
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "div", "em", "font",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li", "ol",
    "p", "pre", "s", "small", "span", "strong", "sub", "sup", "table",
    "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
}

_ALLOWED_ATTRIBUTES = {
    "*": ["style", "dir", "align", "title"],
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height", "loading", "referrerpolicy"],
    "font": ["color", "face", "size"],
    "table": ["width", "height", "cellpadding", "cellspacing", "border", "align"],
    "td": ["width", "height", "colspan", "rowspan", "align", "valign"],
    "th": ["width", "height", "colspan", "rowspan", "align", "valign"],
}

_CSS = CSSSanitizer(allowed_css_properties=[
    "color", "background-color",
    "font-family", "font-size", "font-style", "font-weight",
    "text-align", "text-decoration", "text-transform",
    "line-height", "white-space", "vertical-align",
    "display",
    "width", "min-width", "max-width",
    "height", "min-height", "max-height",
    "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border", "border-top", "border-right", "border-bottom", "border-left",
    "border-color", "border-style", "border-width", "border-collapse",
])

_CLEANER = bleach.Cleaner(
    tags=_ALLOWED_TAGS,
    attributes=_ALLOWED_ATTRIBUTES,
    protocols={"http", "https", "mailto", "tel", "cid"},
    strip=True,
    strip_comments=True,
    css_sanitizer=_CSS,
)

_QUOTE_SELECTORS = (
    ".gmail_quote",
    ".yahoo_quoted",
    ".zmail_extra",
    "#blockquote_zmail",
    "blockquote[type='cite']",
    ".moz-cite-prefix",
)


def _decoded_html_part(message):
    if message.is_multipart():
        for part in message.walk():
            if (
                part.get_content_type() == "text/html"
                and "attachment" not in str(part.get("Content-Disposition", "")).lower()
            ):
                payload = part.get_payload(decode=True)
                if not payload:
                    continue
                charset = part.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace")
        return ""

    if message.get_content_type() != "text/html":
        return ""
    payload = message.get_payload(decode=True)
    if not payload:
        return ""
    charset = message.get_content_charset() or "utf-8"
    return payload.decode(charset, errors="replace")


def _append_style(tag, extra):
    current = (tag.get("style") or "").strip()
    if current and not current.endswith(";"):
        current += ";"
    tag["style"] = current + extra


def extract_sanitized_html(message) -> str:
    """Return safe, display-only HTML for an inbound email.

    Any failure returns an empty string so ingestion always falls back to the
    existing plain-text body instead of rejecting a message.
    """
    try:
        raw = _decoded_html_part(message)
        if not raw:
            return ""

        soup = BeautifulSoup(raw, "html.parser")

        # Outlook often places its reply separator in this element and the
        # quoted message after it as siblings.
        for marker in list(soup.select("#divRplyFwdMsg")):
            for sibling in list(marker.next_siblings):
                try:
                    sibling.extract()
                except Exception:
                    pass
            marker.decompose()

        # Preserve the existing "latest reply only" behaviour for common clients.
        for selector in _QUOTE_SELECTORS:
            for node in list(soup.select(selector)):
                node.decompose()

        cleaned = _CLEANER.clean(str(soup))
        if not cleaned.strip():
            return ""

        result = BeautifulSoup(cleaned, "html.parser")
        for link in result.find_all("a"):
            link["target"] = "_blank"
            link["rel"] = "noopener noreferrer"
        for image in result.find_all("img"):
            src = str(image.get("src") or "")
            if src.startswith(("http://", "https://")):
                image["loading"] = "lazy"
                image["referrerpolicy"] = "no-referrer"
            _append_style(image, "max-width:100%;height:auto;")
        for table in result.find_all("table"):
            _append_style(table, "max-width:100%;")

        return str(result).strip()
    except Exception:
        logger.exception("Failed to sanitize inbound email HTML; using plain text")
        return ""
