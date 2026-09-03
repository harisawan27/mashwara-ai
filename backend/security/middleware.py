"""
Boardroom AI — Security Middleware
====================================
Provides:
- Rate limiting via SlowAPI (5 requests/min per IP on /meeting)
- Input sanitization to strip malicious content
- HTTP security headers middleware
"""

import re
import html
from typing import Any, Dict

from fastapi import FastAPI, Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


# ---------------------------------------------------------------------------
# Rate Limiting
# ---------------------------------------------------------------------------
# Uses client IP as the rate limit key
limiter = Limiter(key_func=get_remote_address)


def setup_rate_limiting(app: FastAPI) -> Limiter:
    """
    Attach SlowAPI rate limiter to the FastAPI app.
    Returns the limiter instance for use as a decorator on routes.
    """
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)

    # Custom handler for rate limit exceeded
    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={
                "error": "Rate limit exceeded. Maximum 5 meeting requests per minute. Please wait and try again."
            },
        )

    return limiter


# ---------------------------------------------------------------------------
# Input Sanitization
# ---------------------------------------------------------------------------
# Maximum allowed length for any single field value
MAX_FIELD_LENGTH = 2000

# Pattern to detect potential injection attacks
INJECTION_PATTERNS = re.compile(
    r"(<script|javascript:|on\w+\s*=|eval\(|exec\(|import\s+os|__import__|subprocess)",
    re.IGNORECASE,
)


def sanitize_string(value: str) -> str:
    """
    Sanitize a single string value:
    1. Strip leading/trailing whitespace
    2. HTML-escape special characters
    3. Remove potential injection patterns
    4. Truncate to MAX_FIELD_LENGTH
    """
    if not isinstance(value, str):
        return str(value)

    # Strip whitespace
    value = value.strip()

    # HTML-escape to neutralize any embedded HTML/JS
    value = html.escape(value)

    # Remove detected injection patterns (replace with empty string)
    value = INJECTION_PATTERNS.sub("", value)

    # Truncate to prevent oversized inputs
    if len(value) > MAX_FIELD_LENGTH:
        value = value[:MAX_FIELD_LENGTH]

    return value


def sanitize_meeting_input(fields: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize all fields in a meeting input dictionary.
    Applies string sanitization to all string values, converts numbers safely.
    """
    sanitized = {}

    for key, value in fields.items():
        # Sanitize the key itself
        clean_key = sanitize_string(str(key))

        if isinstance(value, str):
            sanitized[clean_key] = sanitize_string(value)
        elif isinstance(value, (int, float)):
            sanitized[clean_key] = value
        elif value is None:
            sanitized[clean_key] = ""
        else:
            # Convert anything else to a sanitized string
            sanitized[clean_key] = sanitize_string(str(value))

    return sanitized


# ---------------------------------------------------------------------------
# HTTP Security Headers Middleware
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Adds standard HTTP security headers to all responses.
    These headers protect against common web vulnerabilities.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Enable XSS filter in browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Enforce HTTPS in production
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

        # Restrict resource loading
        response.headers["Content-Security-Policy"] = "default-src 'self'"

        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Prevent caching of sensitive API responses
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

        return response
