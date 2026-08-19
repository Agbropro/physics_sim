"""Vercel function entrypoint for /api/health."""

from src.delivery.api import app

__all__ = ["app"]
