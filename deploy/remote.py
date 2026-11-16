"""Tiny SSH helper for deployment (password auth via environment variables).

    $env:DEPLOY_HOST="1.2.3.4"; $env:DEPLOY_USER="ubuntu"; $env:DEPLOY_PASS="..."
    python deploy/remote.py run "uname -a"
    python deploy/remote.py sudo "ss -ltnp"          # runs as root (sudo -S)
    python deploy/remote.py put local.tar.gz /tmp/x.tar.gz
"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
import paramiko  # noqa: E402


def client():
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(os.environ["DEPLOY_HOST"], port=int(os.environ.get("DEPLOY_PORT", 22)),
              username=os.environ["DEPLOY_USER"], password=os.environ["DEPLOY_PASS"],
              timeout=20, allow_agent=False, look_for_keys=False)
    return c


def run(cmd: str, sudo: bool = False, env: dict | None = None) -> int:
    c = client()
    if sudo:
        exports = " ".join(f"{k}={v!r}" for k, v in (env or {}).items())
        cmd = f"sudo -S -p '' env {exports} bash -lc {cmd!r}"
    stdin, stdout, stderr = c.exec_command(cmd, get_pty=False)
    if sudo:
        stdin.write(os.environ["DEPLOY_PASS"] + "\n")
        stdin.flush()
    for line in iter(stdout.readline, ""):
        sys.stdout.write(line)
    err = stderr.read().decode("utf-8", "replace")
    if err.strip():
        sys.stdout.write(err)
    code = stdout.channel.recv_exit_status()
    c.close()
    return code


def put(local: str, remote: str) -> None:
    c = client()
    sftp = c.open_sftp()
    size = os.path.getsize(local)
    last = [0]

    def progress(done, total):
        pct = int(done * 100 / total)
        if pct >= last[0] + 10:
            last[0] = pct
            print(f"  upload {pct}% ({done // 1048576}/{total // 1048576} MB)", flush=True)

    sftp.put(local, remote, callback=progress)
    print(f"uploaded {local} -> {remote} ({size // 1048576} MB)")
    sftp.close()
    c.close()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    op = sys.argv[1]
    if op == "run":
        sys.exit(run(sys.argv[2]))
    if op == "sudo":
        extra = dict(kv.split("=", 1) for kv in sys.argv[3:])
        sys.exit(run(sys.argv[2], sudo=True, env=extra))
    if op == "put":
        put(sys.argv[2], sys.argv[3])
