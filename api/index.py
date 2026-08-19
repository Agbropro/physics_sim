"""Vercel entrypoint for the FastAPI application."""

from src.delivery.api import app

__all__ = ["app"]
