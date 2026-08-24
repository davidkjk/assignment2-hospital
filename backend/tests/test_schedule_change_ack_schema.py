import pytest

from tests.conftest import seed_staff, set_session_auth


@pytest.mark.asyncio
async def test_schedule_change_ack_table_has_per_change_stamp(db_conn):
    columns = {
        row["column_name"]
        for row in await db_conn.fetch(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public' and table_name = 'schedule_change_acks'
            """
        )
    }
    assert {
        "id",
        "appointment_id",
        "exception_id",
        "action",
        "handled_by",
        "handled_at",
    } <= columns

    unique_constraints = {
        row["constraint_name"]
        for row in await db_conn.fetch(
            """
            select constraint_name
            from information_schema.table_constraints
            where table_schema = 'public'
              and table_name = 'schedule_change_acks'
              and constraint_type = 'UNIQUE'
            """
        )
    }
    assert unique_constraints
    assert await db_conn.fetchval(
        """
        select exists (
            select 1
            from pg_constraint c
            join pg_class t on t.oid = c.conrelid
            where t.relname = 'schedule_change_acks'
              and c.contype = 'u'
              and (
                select array_agg(a.attname order by x.ordinality)
                from unnest(c.conkey) with ordinality as x(attnum, ordinality)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum
              ) = array['appointment_id', 'exception_id']::name[]
        )
        """
    )


@pytest.mark.asyncio
async def test_schedule_change_ack_is_rls_managed_and_card_columns_exist(db_conn):
    card_columns = {
        row["column_name"]
        for row in await db_conn.fetch(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'appointments'
              and column_name in ('hospital_change_prev_time', 'hospital_change_kind')
            """
        )
    }
    assert card_columns == {"hospital_change_prev_time", "hospital_change_kind"}

    policy = await db_conn.fetchrow(
        """
        select permissive, roles, cmd, qual, with_check
        from pg_policies
        where schemaname = 'public'
          and tablename = 'schedule_change_acks'
          and policyname = 'staff_manage_acks'
        """
    )
    assert policy is not None
    assert policy["cmd"] == "ALL"
    assert "is_active_staff" in policy["qual"]
    assert "is_active_staff" in policy["with_check"]

    admin = await seed_staff(db_conn, role="admin")
    await set_session_auth(db_conn, admin["auth_user_id"])
    assert await db_conn.fetchval(
        "select relrowsecurity from pg_class where oid = 'public.schedule_change_acks'::regclass"
    ) is True


@pytest.mark.asyncio
async def test_schedule_change_ack_action_is_limited(db_conn):
    columns = await db_conn.fetchrow(
        """
        select udt_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'schedule_change_acks'
          and column_name = 'action'
        """
    )
    assert columns["udt_name"] == "text"

    constraint = await db_conn.fetchval(
        """
        select pg_get_constraintdef(oid)
        from pg_constraint
        where conrelid = 'public.schedule_change_acks'::regclass
          and contype = 'c'
          and pg_get_constraintdef(oid) like '%rescheduled%'
        """
    )
    assert constraint is not None
