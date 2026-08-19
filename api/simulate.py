"""Vercel function entrypoint for /api/simulate."""

from src.delivery.api import app

__all__ = ["app"]
