from datetime import date

from app.jobs.backup import select_expired


def test_select_expired_keeps_recent_14_days():
    names = [
        "backup-2026-07-01.sql.gz",   # 26일 전 → 삭제 대상
        "backup-2026-07-14.sql.gz",   # 13일 전 → 보관
        "backup-2026-07-27.sql.gz",   # 오늘 → 보관
        "not-a-backup.txt",           # 형식 불일치 → 건드리지 않음
    ]
    expired = select_expired(names, today=date(2026, 7, 27), keep_days=14)
    assert expired == ["backup-2026-07-01.sql.gz"]
