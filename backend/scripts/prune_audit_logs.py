"""Dry-run-first cleanup for expired audit history.

Run from the backend directory:
    uv run python -m scripts.prune_audit_logs --days 180
    uv run python -m scripts.prune_audit_logs --days 180 --execute

The first command reports how many rows would be removed. Deletion only occurs
when --execute is explicitly supplied. Schedule the execute form only after
your organization's audit-retention period has been approved.
"""

import argparse
import logging
from datetime import UTC, datetime, timedelta

from sqlmodel import Session, col, delete, func, select

from app.core.db import engine
from app.models import AuditLog

logger = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    parser = argparse.ArgumentParser(description="Prune expired audit log entries.")
    parser.add_argument(
        "--days",
        type=int,
        default=180,
        help="Retain this many days of audit history (default: 180).",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete expired entries. Without this flag, the command is a dry run.",
    )
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days must be at least 1")

    cutoff = datetime.now(UTC) - timedelta(days=args.days)
    with Session(engine) as session:
        expired_count = session.exec(
            select(func.count())
            .select_from(AuditLog)
            .where(col(AuditLog.occurred_at) < cutoff)
        ).one()
        logger.info("Retention cutoff: %s", cutoff.isoformat())
        logger.info("Expired audit entries: %s", expired_count)

        if not args.execute:
            logger.info("Dry run only. Re-run with --execute to delete these entries.")
            return

        session.exec(delete(AuditLog).where(col(AuditLog.occurred_at) < cutoff))
        session.add(
            AuditLog(
                actor_user_id=None,
                action=f"RETENTION_PRUNE audit_logs count={expired_count}",
                resource="audit_logs",
                method="RETENTION",
                path="maintenance/audit-retention",
                request_id=None,
                status_code=200,
                outcome="success",
                duration_ms=0.0,
            )
        )
        session.commit()
        logger.info("Deleted %s expired audit entries.", expired_count)
        logger.info("Recorded the retention operation in the remaining audit history.")


if __name__ == "__main__":
    main()
