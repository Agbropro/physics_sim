"""Vercel function entrypoint for /api/com."""

from src.delivery.api import app

__all__ = ["app"]
