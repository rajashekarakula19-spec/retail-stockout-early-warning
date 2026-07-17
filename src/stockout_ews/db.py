from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import pandas as pd
import psycopg


def database_url(config: dict | None = None) -> str:
    return os.getenv("DATABASE_URL") or (config or {}).get("database_url") or "postgresql:///retail_stockout"


@contextmanager
def connect(config: dict | None = None) -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(database_url(config))
    try:
        yield conn
    finally:
        conn.close()


def read_sql(query: str, config: dict | None = None, params: dict | None = None) -> pd.DataFrame:
    with connect(config) as conn:
        return pd.read_sql_query(query, conn, params=params)
