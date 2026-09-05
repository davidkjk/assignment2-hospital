"""매일 새벽 크론이 실행하는 DB 백업 잡. 실행: python -m app.jobs.backup"""
import gzip
import re
import subprocess
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from app.core.config import settings
from app.db.admin_client import get_admin_client

BACKUP_NAME_RE = re.compile(r"^backup-(\d{4}-\d{2}-\d{2})\.sql\.gz$")
KST = ZoneInfo("Asia/Seoul")


def select_expired(names: list[str], today: date, keep_days: int = 14) -> list[str]:
    cutoff = today - timedelta(days=keep_days)
    expired = []
    for name in names:
        m = BACKUP_NAME_RE.match(name)
        if m and date.fromisoformat(m.group(1)) < cutoff:
            expired.append(name)
    return expired


def run_backup(today: date | None = None) -> str:
    # [정합성 검토 우선10] 서버 OS 타임존이 UTC일 수 있어 KST로 명시 변환(Task 6과 동일 사유)
    today = today or datetime.now(KST).date()
    filename = f"backup-{today.isoformat()}.sql.gz"
    with tempfile.TemporaryDirectory() as tmp:
        dump_path = Path(tmp) / "dump.sql"
        subprocess.run(
            ["pg_dump", "--no-owner", "--no-privileges", "-f", str(dump_path), settings.database_url],
            check=True,
        )
        gz_path = Path(tmp) / filename
        with open(dump_path, "rb") as src, gzip.open(gz_path, "wb") as dst:
            dst.writelines(src)

        storage = get_admin_client().storage.from_(settings.backup_bucket)
        with open(gz_path, "rb") as f:
            storage.upload(filename, f.read(), {"content-type": "application/gzip", "upsert": "true"})

        existing = [obj["name"] for obj in storage.list()]
        for name in select_expired(existing, today):
            storage.remove([name])
    print(f"[backup] uploaded {filename}, pruned expired")
    return filename


if __name__ == "__main__":
    run_backup()
