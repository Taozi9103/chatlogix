import os
from contextlib import contextmanager
from threading import Lock

import pymysql


def _required(name: str) -> str:
    value = os.getenv(name)
    if value is None or value == "":
        raise RuntimeError(f"Missing required env: {name}")
    return value


def _conn_kwargs(database: str | None = None):
    return dict(
        host=_required("DB_HOST"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=_required("DB_USER"),
        password=_required("DB_PASSWORD"),
        database=database,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


@contextmanager
def get_conn(database: str | None = None):
    conn = pymysql.connect(**_conn_kwargs(database=database))
    try:
        yield conn
    finally:
        conn.close()


def ensure_schema():
    db_name = _required("DB_NAME")
    with get_conn(database=None) as conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}`")

    with get_conn(database=db_name) as conn:
        with conn.cursor() as cur:
            def ensure_index(index_name: str, table: str, columns_sql: str):
                cur.execute(
                    """
                    SELECT 1
                    FROM information_schema.statistics
                    WHERE table_schema = %s AND table_name = %s AND index_name = %s
                    LIMIT 1
                    """,
                    (db_name, table, index_name),
                )
                exists = cur.fetchone() is not None
                if not exists:
                    cur.execute(f"CREATE INDEX {index_name} ON {table} ({columns_sql})")

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  username VARCHAR(50) UNIQUE NOT NULL,
                  password VARCHAR(255) NOT NULL,
                  email VARCHAR(100) UNIQUE,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  user_id INT NOT NULL,
                  title VARCHAR(100) DEFAULT '新对话',
                  role_id VARCHAR(50) DEFAULT 'assistant',
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS messages (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  conversation_id INT,
                  user_id INT NOT NULL,
                  role ENUM('user', 'assistant') NOT NULL,
                  content TEXT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS tags (
                  id INT AUTO_INCREMENT PRIMARY KEY,
                  user_id INT NOT NULL,
                  name VARCHAR(50) NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                  UNIQUE KEY uq_tags_user_name (user_id, name)
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS conversation_tags (
                  conversation_id INT NOT NULL,
                  tag_id INT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (conversation_id, tag_id),
                  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS conversation_favorites (
                  conversation_id INT NOT NULL,
                  user_id INT NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (user_id, conversation_id),
                  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
                """
            )

            ensure_index("idx_conversations_user_updated_id", "conversations", "user_id, updated_at, id")
            ensure_index("idx_tags_user_name", "tags", "user_id, name")
            ensure_index(
                "idx_conversation_tags_tag_conversation", "conversation_tags", "tag_id, conversation_id"
            )
            ensure_index(
                "idx_conversation_favorites_user_conversation",
                "conversation_favorites",
                "user_id, conversation_id",
            )


_schema_lock = Lock()
_schema_ready = False


def ensure_schema_once():
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        ensure_schema()
        _schema_ready = True


def query(sql: str, params: tuple | list | None = None):
    db_name = _required("DB_NAME")
    with get_conn(database=db_name) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            if cur.description is None:
                return None
            return cur.fetchall()


def execute(sql: str, params: tuple | list | None = None):
    db_name = _required("DB_NAME")
    with get_conn(database=db_name) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            return cur.lastrowid

