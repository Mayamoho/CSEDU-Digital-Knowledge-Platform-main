import psycopg
from psycopg.rows import dict_row
from contextlib import contextmanager
from config import settings
import logging

logger = logging.getLogger(__name__)


class Database:
    def __init__(self):
        self.connection_string = (
            f"host={settings.db_host} "
            f"port={settings.db_port} "
            f"dbname={settings.db_name} "
            f"user={settings.db_user} "
            f"password={settings.db_password}"
        )

    @contextmanager
    def get_connection(self):
        """Context manager for database connections"""
        conn = None
        try:
            conn = psycopg.connect(
                self.connection_string,
                row_factory=dict_row
            )
            yield conn
        except Exception as e:
            logger.error(f"Database connection error: {e}")
            raise
        finally:
            if conn:
                conn.close()

    def execute_query(self, query: str, params: tuple = None):
        """Execute a query and return results"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                try:
                    return cur.fetchall()
                except psycopg.ProgrammingError:
                    # No results to fetch (INSERT, UPDATE, etc.)
                    return None

    def execute_one(self, query: str, params: tuple = None):
        """Execute a query and return single result"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params or ())
                return cur.fetchone()


db = Database()
