To fix the alembic version file syntax error and get the tests running properly, I need to correct the datetime format in the alembic version file.

Current error: The file has "Create Date: 2026-09-19 23:26:04.100" which has leading zeros in the decimal part.

Fixed version: Change to "Create Date: 2026-09-19 23:26:04.1"

Let me create a simple script to fix this.