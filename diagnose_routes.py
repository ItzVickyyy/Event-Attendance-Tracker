
import os
from unittest.mock import MagicMock
import sys

# Mock environment variables to satisfy Pydantic
os.environ["SECRET_KEY"] = "test-secret"
os.environ["PROJECT_NAME"] = "Test Project"
os.environ["DATABASE_URL"] = "postgresql://user:pass@localhost:5432/db"
os.environ["FIRST_SUPERUSER"] = "admin@example.com"
os.environ["FIRST_SUPERUSER_PASSWORD"] = "password"

# Add backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.main import app
from app.core.config import settings

print(f"API_V1_STR: {settings.API_V1_STR}")

print("\nRegistered Routes:")
for route in app.routes:
    if hasattr(route, "path"):
        # Display route path, name, and methods if available
        methods = getattr(route, "methods", "N/A")
        print(f"Path: {route.path:30} | Name: {route.name:20} | Methods: {methods}")
