"""A throwaway Postgres cluster for the multi-tenant schema tests (spec 013). Skipped when Postgres is not installed."""
from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))


def _pg_bin() -> Path | None:
    for d in sorted(Path("/usr/lib/postgresql").glob("*/bin"), reverse=True):
        if (d / "initdb").exists():
            return d
    found = shutil.which("initdb")
    return Path(found).parent if found else None


class Cluster:
    def __init__(self, bindir: Path, data: Path, sock: Path, run_as: list[str]):
        self.bindir, self.data, self.sock, self.run_as = bindir, data, sock, run_as

    def psql(self, sql: str, user: str | None = None, check: bool = True, client_id: str | None = None) -> subprocess.CompletedProcess:
        """Runs `sql` as the superuser, or as a signed-in person (role `authenticated` + JWT claims) when `user` is a uuid."""
        pre = ""
        if user == "anon":
            pre = "set role anon;\n"
        elif user == "service":
            pre = "set role service_role;\n"
        elif user:
            extra = f',\"client_id\":\"{client_id}\"' if client_id else ""     # an OAuth client token (an agent) carries the client's id
            pre = f"set role authenticated;\nselect set_config('request.jwt.claims', '{{\"sub\":\"{user}\",\"role\":\"authenticated\"{extra}}}', false);\n"
        cmd = self.run_as + [str(self.bindir / "psql"), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-h", str(self.sock), "-d", "speco", "-f", "-"]
        r = subprocess.run(cmd, input=pre + sql, capture_output=True, text=True)
        if check and r.returncode != 0:
            raise AssertionError(r.stderr)
        return r

    def rows(self, sql: str, user: str | None = None, client_id: str | None = None) -> list[str]:
        out = self.psql(sql, user, client_id=client_id).stdout.strip()
        # `set_config(...)` prints its own value first when run as a person
        lines = [ln for ln in out.splitlines() if ln and not ln.startswith('{"sub"')]
        return lines

    def fails(self, sql: str, user: str | None = None, client_id: str | None = None) -> str:
        r = self.psql(sql, user, check=False, client_id=client_id)
        assert r.returncode != 0, f"expected an error, got: {r.stdout}"
        return r.stderr


def start_cluster():
    """-> (Cluster, stop). A throwaway Postgres with the Supabase pieces stubbed and every migration applied."""
    bindir = _pg_bin()
    if bindir is None:
        raise FileNotFoundError("PostgreSQL is not installed")
    tmp = Path(tempfile.mkdtemp(prefix="speco-pg-"))
    run_as: list[str] = []
    if os.geteuid() == 0:                                    # postgres refuses to run as root
        run_as = ["runuser", "-u", "postgres", "--"]
        tmp.chmod(0o755)
    data, sock = tmp / "data", tmp / "sock"
    sock.mkdir()
    for p in (tmp, sock):
        if run_as:
            shutil.chown(p, "postgres", "postgres")

    def stop():
        subprocess.run(run_as + [str(bindir / "pg_ctl"), "-D", str(data), "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)

    try:
        subprocess.run(run_as + [str(bindir / "initdb"), "-D", str(data), "-U", "postgres", "--auth=trust", "-E", "UTF8"], check=True, capture_output=True)
        subprocess.run(run_as + [str(bindir / "pg_ctl"), "-D", str(data), "-o", f"-c listen_addresses='' -c unix_socket_directories={sock}", "-w", "-l", str(tmp / "log"), "start"],
                       check=True, capture_output=True)
        c = Cluster(bindir, data, sock, run_as)
        subprocess.run(run_as + [str(bindir / "createdb"), "-h", str(sock), "-U", "postgres", "speco"], check=True, capture_output=True)
        c.psql((Path(__file__).parent / "supabase_stub.sql").read_text())
        for m in MIGRATIONS:
            c.psql(m.read_text())
        return c, stop
    except Exception:
        stop()
        raise


@pytest.fixture(scope="session")
def pg():
    try:
        cluster, stop = start_cluster()
    except FileNotFoundError:
        pytest.skip("PostgreSQL is not installed")
    try:
        yield cluster
    finally:
        stop()
