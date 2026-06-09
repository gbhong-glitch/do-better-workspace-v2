#!/usr/bin/env python3
"""
Mac 카톡 로컬 DB 오프라인 리더 (읽기 전용 · 서버 접속 0 · 본인 기기 본인 계정만).

다른 Mac에서도 동작하도록 일반화: userId 자동 추출+캐시, UUID·파일명·키 자동 도출.

동작 원리 요약 (상세는 reference/how-it-works.md):
  1) UUID = ioreg IOPlatformUUID (기기 고유, 자동)
  2) userId = Cache.db의 talk-user-id 헤더 (계정 고유, 1회 추출 후 캐시)
  3) DB 파일명·SQLCipher 키 = PBKDF2-HMAC-SHA256(100k, 128B)로 도출
  4) 열기: PRAGMA key 먼저 → cipher_compatibility=3 나중 (순서 중요)

전제: brew install sqlcipher
사용:
  python3 kakao_read.py setup            # userId 추출·캐시 (최초 1회. 분류기에 막히면 사람이 직접)
  python3 kakao_read.py chats [N]        # 최근 방 N개
  python3 kakao_read.py read <chatId> [N]# 방 메시지 N개 (오래된→최신 표시)
  python3 kakao_read.py search "키워드" [N]
  python3 kakao_read.py media <chatId> [N] [outdir]  # 최근 미디어 다운로드(CDN, 사진/파일)
  python3 kakao_read.py check            # '지난 체크 이후' 새 활동 1:1 방 목록(메뉴형 수집)
  python3 kakao_read.py since <chatId>   # 그 방의 '지난 체크 이후' 메시지만(창 기준)
  python3 kakao_read.py mark             # 지금을 '마지막 체크 시각'으로 저장(창 전진)
  python3 kakao_read.py tables           # 스키마 확인
환경변수 KT_USER_ID 로 userId 직접 지정 가능(캐시 무시).
"""
import base64
import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
import datetime as _dt
import plistlib
from collections import Counter
from pathlib import Path

HOME = Path.home()
CONTAINER = HOME / "Library/Containers/com.kakao.KakaoTalkMac/Data/Library"
DBDIR = CONTAINER / "Application Support/com.kakao.KakaoTalkMac"
CACHE_DB = CONTAINER / "Caches/Cache.db"
CONFIG = HOME / ".config/kakao-read/config.json"


# ---- userId ---------------------------------------------------------------
def extract_user_id_from_cache():
    """Cache.db 요청객체 plist의 talk-user-id 헤더에서 본인 userId 추출."""
    if not CACHE_DB.exists():
        return None
    con = sqlite3.connect(f"file:{CACHE_DB}?mode=ro&immutable=1", uri=True)
    rows = con.execute(
        "SELECT request_object FROM cfurl_cache_blob_data WHERE request_object IS NOT NULL"
    ).fetchall()
    con.close()
    found = Counter()
    for (blob,) in rows:
        try:
            p = plistlib.loads(bytes(blob))
        except Exception:
            continue
        arr = p.get("Array") if isinstance(p, dict) else None
        if not isinstance(arr, list):
            continue
        for item in arr:
            if isinstance(item, dict) and "talk-user-id" in item:
                found[str(item["talk-user-id"])] += 1
    if not found:
        return None
    return int(found.most_common(1)[0][0])


def _load_config() -> dict:
    if CONFIG.exists():
        try:
            return json.loads(CONFIG.read_text())
        except Exception:
            return {}
    return {}


def _save_config(d: dict):
    CONFIG.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps(d, ensure_ascii=False))


def load_cached_user_id():
    try:
        return int(_load_config()["user_id"])
    except Exception:
        return None


def save_user_id(uid: int):
    d = _load_config()
    d["user_id"] = int(uid)
    _save_config(d)


def load_last_check():
    """마지막 '카톡 체크' 시각(unix초). 없으면 None."""
    v = _load_config().get("last_check")
    try:
        return int(v) if v else None
    except Exception:
        return None


def save_last_check(ts: int):
    d = _load_config()
    d["last_check"] = int(ts)
    _save_config(d)


def get_user_id():
    env = os.environ.get("KT_USER_ID")
    if env and env.isdigit():
        return int(env)
    cached = load_cached_user_id()
    if cached:
        return cached
    uid = extract_user_id_from_cache()       # 자동 시도
    if uid:
        save_user_id(uid)
        return uid
    raise SystemExit(
        "userId를 못 구했습니다. 터미널에서 직접 실행하세요:\n"
        "  python3 kakao_read.py setup\n"
        "(Claude 안전분류기가 Cache.db 접근을 막을 수 있어 사람이 직접 1회 실행 권장)"
    )


# ---- 키 도출 (kakaocli·k-skill·blluv gist 정식 공식) ----------------------
def platform_uuid() -> str:
    out = subprocess.run(
        ["/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
        capture_output=True, text=True, check=True,
    ).stdout
    for line in out.splitlines():
        if "IOPlatformUUID" in line:
            parts = line.split('"')          # ["  ","IOPlatformUUID"," = ","<UUID>",""]
            if len(parts) >= 4 and len(parts[3].strip()) >= 36:
                return parts[3].strip()
    raise RuntimeError("IOPlatformUUID 못 찾음")


def hashed_device_uuid(uuid: str) -> str:
    return base64.standard_b64encode(
        hashlib.sha1(uuid.encode()).digest() + hashlib.sha256(uuid.encode()).digest()
    ).decode()


def derive_db_name(user_id: int, uuid: str) -> str:
    # 정식: ".".join([".","F",userId,"A","F",reversed_uuid,".","|"]) → ..F.{id}.A.F.{rev}...|
    # (openkakao는 여기서 점 하나가 빠진 ..| 버그라 파일명이 틀린다)
    hawawa = ".".join([".", "F", str(user_id), "A", "F", uuid[::-1], ".", "|"])
    salt = hashed_device_uuid(uuid)[::-1].encode()
    hexd = hashlib.pbkdf2_hmac("sha256", hawawa.encode(), salt, 100_000, 128).hex()
    return hexd[28:28 + 78]


def derive_secure_key(user_id: int, uuid: str) -> str:
    parts = ["A", hashed_device_uuid(uuid), "|", "F", uuid[:5], "H", str(user_id), "|", uuid[7:]]
    hawawa = "F".join(parts)[::-1].encode()
    salt = uuid[int(len(uuid) * 0.3):].encode()
    return hashlib.pbkdf2_hmac("sha256", hawawa, salt, 100_000, 128).hex()


# ---- 열기 -----------------------------------------------------------------
def run_sql(sql: str) -> str:
    if not shutil.which("sqlcipher"):
        raise SystemExit("sqlcipher 미설치. 먼저:  brew install sqlcipher")
    uuid = platform_uuid()
    uid = get_user_id()
    name = derive_db_name(uid, uuid)
    if not (DBDIR / name).exists():
        raise SystemExit(
            f"도출 DB 파일이 없습니다: {name}\n"
            "userId/UUID가 이 기기와 안 맞거나, 카톡 미로그인 상태일 수 있습니다."
        )
    tmp = tempfile.mkdtemp()
    try:
        for suf in ("", "-wal", "-shm"):          # 최신 메시지 포함 위해 WAL/SHM 함께
            src = DBDIR / (name + suf)
            if src.exists():
                shutil.copy2(src, os.path.join(tmp, "k.db" + suf))
        db = os.path.join(tmp, "k.db")
        key = derive_secure_key(uid, uuid)
        # 순서 중요: key 먼저, cipher_compatibility 나중
        head = (".mode list\n.headers off\n"
                f"PRAGMA key='{key}';\nPRAGMA cipher_compatibility=3;\n")
        r = subprocess.run(["sqlcipher", db], input=head + sql,
                           capture_output=True, text=True)
        if "file is not a database" in (r.stderr or ""):
            raise SystemExit("복호화 실패: 키 불일치 (userId/UUID 점검)")
        if r.returncode != 0 and r.stderr.strip():
            raise SystemExit(f"sqlcipher 오류: {r.stderr.strip()}")
        out = r.stdout
        if out.startswith("ok\n"):      # PRAGMA key 응답 줄 제거
            out = out[3:]
        return out.strip()
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---- 명령 -----------------------------------------------------------------
def cmd_setup():
    uid = extract_user_id_from_cache()
    if not uid:
        print("Cache.db에서 talk-user-id를 못 찾음. 카톡 로그인 상태인지 확인하세요.")
        return
    save_user_id(uid)
    print(f"userId = {uid}  →  캐시 저장: {CONFIG}")
    print("이제 chats / read / search 명령을 쓸 수 있습니다.")


def cmd_tables():
    print(run_sql("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"))


def cmd_chats(n=20):
    print(run_sql(f"""
    SELECT r.chatId, r.type, r.activeMembersCount,
           COALESCE(NULLIF(r.chatName,''), u.displayName, u.nickName, '(이름없음)')
    FROM NTChatRoom r
    LEFT JOIN NTUser u ON r.directChatMemberUserId = u.userId AND u.linkId = 0
    ORDER BY r.lastUpdatedAt DESC LIMIT {int(n)};"""))


def cmd_read(chat_id, n=50):
    # 최신 N개를 시간 오름차순으로. 미디어는 [사진]/[파일:이름] 마커로 인라인 표시.
    out = run_sql(f"""
    SELECT datetime(sentAt,'unixepoch','localtime'), sender, body FROM (
      SELECT m.sentAt,
             COALESCE(u.displayName, u.nickName, CAST(m.authorId AS TEXT)) AS sender,
             CASE
               WHEN m.type IN (2,27) THEN '[사진]'
               WHEN m.type=3  THEN '[동영상]'
               WHEN m.type=12 THEN '[음성]'
               WHEN m.type=14 THEN '[GIF/이모티콘]'
               WHEN m.type=18 THEN '[파일] '||COALESCE(m.message,'')
               WHEN m.message IS NOT NULL AND m.message!='' THEN m.message
               ELSE NULL
             END AS body
      FROM NTChatMessage m
      LEFT JOIN NTUser u ON m.authorId = u.userId AND u.linkId = 0
      WHERE m.chatId = {int(chat_id)} AND m.type IN (1,2,3,12,14,18,26,27,72)
      ORDER BY m.sentAt DESC LIMIT {int(n)}
    ) WHERE body IS NOT NULL ORDER BY sentAt ASC;""")
    print(out)
    if "[사진]" in out or "[파일]" in out or "[동영상]" in out:
        print(f"\n# 미디어 있음 → 내용 파악이 필요하면: python3 kakao_read.py media {chat_id} <N>")


TYPE_LABEL = {2: "사진", 27: "사진", 3: "동영상", 12: "음성", 14: "GIF", 18: "파일"}


def cmd_media(chat_id, n=5, out_dir=None):
    """방의 최근 미디어를 CDN 서명URL로 다운로드(평문). 사진=비전, 파일=텍스트로 Claude가 Read.

    주의: 이 명령만 네트워크(카톡 CDN GET)를 쓴다. LOCO/로그인이 아니라 단순 파일 GET이라
    세션 충돌·밴 위험 없음. 단 URL에 만료가 있어 오래된 미디어는 받지 못할 수 있다.
    """
    out_dir = out_dir or os.path.join(str(HOME), ".config/kakao-read/media", str(chat_id))
    os.makedirs(out_dir, exist_ok=True)
    raw = run_sql(f"""
    SELECT m.sentAt, m.type,
           COALESCE(u.displayName, u.nickName, CAST(m.authorId AS TEXT)),
           m.attachment
    FROM NTChatMessage m
    LEFT JOIN NTUser u ON m.authorId = u.userId AND u.linkId = 0
    WHERE m.chatId = {int(chat_id)} AND m.type IN (2,3,12,14,18,27)
          AND m.attachment LIKE '%"url"%'
    ORDER BY m.sentAt DESC LIMIT {int(n)};""")
    if not raw.strip():
        print("다운로드 가능한 미디어가 없습니다.")
        return
    for line in raw.splitlines():
        parts = line.split("|", 3)                 # attachment가 마지막(내부 | 안전)
        if len(parts) < 4:
            continue
        ts, typ, sender, att = parts
        try:
            j = json.loads(att)
        except Exception:
            continue
        url = j.get("url")
        if not url:
            continue
        name = j.get("name") or os.path.basename(j.get("k", "media")).split("?")[0]
        name = os.path.basename(name.replace("\\", "_")) or "media"   # 경로 탈출 방지
        path = os.path.join(out_dir, name)
        when = _dt.datetime.fromtimestamp(int(ts)).strftime("%m-%d %H:%M")
        label = TYPE_LABEL.get(int(typ), f"type{typ}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=30).read()
            with open(path, "wb") as f:
                f.write(data)
            print(f"{when} | {sender} | {label} | {len(data):,}B | {path}")
        except Exception as e:
            print(f"{when} | {sender} | {label} | 실패(만료/접근불가): {str(e)[:40]}")
    print(f"\n저장 폴더: {out_dir}")
    print("→ Claude가 위 경로를 Read로 열어 사진은 비전으로, 텍스트 파일은 그대로 내용 파악")


def cmd_search(kw, n=30):
    kw = kw.replace("'", "''")
    print(run_sql(f"""
    SELECT datetime(m.sentAt,'unixepoch','localtime'), m.chatId,
           COALESCE(u.displayName, u.nickName, CAST(m.authorId AS TEXT)), m.message
    FROM NTChatMessage m
    LEFT JOIN NTUser u ON m.authorId = u.userId AND u.linkId = 0
    WHERE m.message LIKE '%{kw}%'
    ORDER BY m.sentAt DESC LIMIT {int(n)};"""))


# ---- 카톡 체크(on-demand 메뉴형 수집) -------------------------------------
# 1:1 판별자: directChatMemberUserId != 0  (검증 2026-06-02: 모든 방이 NOT NULL,
#   단톡 type1·오픈챗 type4·채널 type5는 값이 0. != 0 이면 친구 type0 + 비즈니스 type2 등 1:1만 남음)
# 소규모 그룹 포함(2026-06-09): B2B 인바운드가 담당자 2~3명+본인 그룹방으로 들어오는 경우
#   (예: 거래처 담당자 2명+본인 3인방)가 1:1 필터에서 새던 문제. type 1 그룹방 중 인원이
#   GROUP_MAX 이하인 소규모만 추가로 포함 → 대형 단톡(수십~수백명)·오픈챗(type4)·채널(type5)은 계속 제외.
DIRECT_FILTER = "r.directChatMemberUserId != 0"
DEFAULT_GROUP_MAX = 5              # 본인 포함 5명 이하 그룹방까지 체크에 포함 (config check_group_max_members 로 조정)
DEFAULT_FIRST_WINDOW = 2 * 86400   # 첫 실행(마지막 체크 없음) 시 최근 2일만


def cmd_check(*args):
    """'지난번 체크 이후' 새 활동이 있는 1:1 대화방 목록 (이름·시각·마지막메시지 미리보기).
    메뉴형 수집: 후보를 차려주고 사용자가 골라 since 로 읽는다. 끝나면 mark 로 창 전진."""
    last = load_last_check()
    if last:
        cutoff = last
        window = f"지난 체크({_dt.datetime.fromtimestamp(last):%Y-%m-%d %H:%M}) 이후"
    else:
        cutoff = int(time.time()) - DEFAULT_FIRST_WINDOW
        window = "최근 2일 (첫 실행 — 마지막 체크 기록 없음)"
    myid = get_user_id()
    group_max = int(_load_config().get("check_group_max_members", DEFAULT_GROUP_MAX))
    # 1:1(directChatMemberUserId!=0) 또는 소규모 그룹(type 1, 인원 group_max 이하)만.
    scope = (f"({DIRECT_FILTER} OR (r.directChatMemberUserId = 0 AND r.type = 1 "
             f"AND r.activeMembersCount IS NOT NULL AND r.activeMembersCount <= {group_max}))")
    # 그룹방은 chatName이 비면 '(이름없음)' → 발신자(본인 제외) 집계로 라벨 보강.
    group_label = (
        "(SELECT group_concat(nm, ', ') FROM (SELECT DISTINCT "
        "COALESCE(u2.displayName, u2.nickName, CAST(m2.authorId AS TEXT)) AS nm "
        "FROM NTChatMessage m2 LEFT JOIN NTUser u2 ON m2.authorId=u2.userId AND u2.linkId=0 "
        f"WHERE m2.chatId=r.chatId AND m2.authorId NOT IN (0,{myid}) AND m2.authorId IS NOT NULL "
        "LIMIT 4))")
    rows = run_sql(f"""
    SELECT r.chatId,
           COALESCE(NULLIF(r.chatName,''), u.displayName, u.nickName, {group_label}, '(이름없음)') AS name,
           datetime(r.lastUpdatedAt,'unixepoch','localtime') AS last_time,
           (SELECT CASE
                     WHEN mm.type IN (2,27) THEN '[사진]'
                     WHEN mm.type=3  THEN '[동영상]'
                     WHEN mm.type=12 THEN '[음성]'
                     WHEN mm.type=14 THEN '[GIF/이모티콘]'
                     WHEN mm.type=18 THEN '[파일] '||COALESCE(mm.message,'')
                     WHEN mm.message IS NOT NULL AND mm.message!=''
                       THEN substr(replace(replace(mm.message,char(10),' '),char(13),' '),1,40)
                     ELSE ''
                   END
            FROM NTChatMessage mm
            WHERE mm.chatId=r.chatId AND mm.type IN (1,2,3,12,14,18,26,27,72)
            ORDER BY mm.sentAt DESC LIMIT 1) AS preview
    FROM NTChatRoom r
    LEFT JOIN NTUser u ON r.directChatMemberUserId = u.userId AND u.linkId = 0
    WHERE {scope} AND r.lastUpdatedAt > {cutoff}
    ORDER BY r.lastUpdatedAt DESC;""")
    # 방 이름 부분일치 blocklist (config의 check_blocklist, 기본 빈 목록 → 필터 없음).
    # SMS blocklist(본문 키워드 부분일치)와 같은 철학을 방 이름에 적용. 마케팅·알림 계정 정리용.
    block = _load_config().get("check_blocklist", [])
    lines = [ln for ln in rows.splitlines() if ln.strip()]
    if block:
        kept = [ln for ln in lines
                if not any(b in ln.split("|", 2)[1] for b in block if b)]
        hidden = len(lines) - len(kept)
        lines = kept
    else:
        hidden = 0
    print(f"# 카톡 체크 (1:1 + 소규모 그룹 ≤{group_max}명) — {window}")
    if not lines:
        print("새 활동 있는 대화 없음.")
    else:
        print("\n".join(lines))
        tail = f" (blocklist로 {hidden}개 숨김)" if hidden else ""
        print(f"\n# {len(lines)}개 방에 새 활동{tail}. "
              f"읽을 방: python3 kakao_read.py since <chatId>")
    print("# 체크 끝나면 창 전진: python3 kakao_read.py mark")


def cmd_since(chat_id, since=None):
    """방의 '지난번 체크 이후' 메시지만 (창 기준 sentAt > 마지막체크시각). 빠짐 없이 그 창 전부."""
    cutoff = int(since) if since else (load_last_check() or 0)
    out = run_sql(f"""
    SELECT datetime(sentAt,'unixepoch','localtime'), sender, body FROM (
      SELECT m.sentAt,
             COALESCE(u.displayName, u.nickName, CAST(m.authorId AS TEXT)) AS sender,
             CASE
               WHEN m.type IN (2,27) THEN '[사진]'
               WHEN m.type=3  THEN '[동영상]'
               WHEN m.type=12 THEN '[음성]'
               WHEN m.type=14 THEN '[GIF/이모티콘]'
               WHEN m.type=18 THEN '[파일] '||COALESCE(m.message,'')
               WHEN m.message IS NOT NULL AND m.message!='' THEN m.message
               ELSE NULL
             END AS body
      FROM NTChatMessage m
      LEFT JOIN NTUser u ON m.authorId = u.userId AND u.linkId = 0
      WHERE m.chatId = {int(chat_id)} AND m.sentAt > {cutoff}
            AND m.type IN (1,2,3,12,14,18,26,27,72)
      ORDER BY m.sentAt ASC
    ) WHERE body IS NOT NULL;""")
    print(out if out.strip() else "(이 창에 표시할 메시지 없음)")
    if "[사진]" in out or "[파일]" in out or "[동영상]" in out:
        print(f"\n# 미디어 있음 → 내용 파악 필요시: python3 kakao_read.py media {chat_id} <N>")


def cmd_mark():
    """현재 시각을 '마지막 체크 시각'으로 저장 → 다음 check 의 창 시작점이 됨."""
    now = int(time.time())
    save_last_check(now)
    print(f"마지막 체크 시각 갱신: {_dt.datetime.fromtimestamp(now):%Y-%m-%d %H:%M:%S}")


if __name__ == "__main__":
    # 이 스크립트는 Mac 카카오톡 로컬 DB 전용. 윈도우/리눅스에선 윈도우 리더(win/kakao_win.py)를 쓴다.
    if sys.platform != "darwin":
        print("kakao_read.py는 macOS 전용입니다 (Mac 카카오톡 로컬 DB). 윈도우는 win/kakao_win.py를 사용하세요. 현재 OS:", sys.platform)
        sys.exit(2)
    a = sys.argv[1:]
    if not a:
        print(__doc__); sys.exit(0)
    cmd, rest = a[0], a[1:]
    {
        "setup": lambda: cmd_setup(),
        "tables": lambda: cmd_tables(),
        "chats": lambda: cmd_chats(*(rest[:1] or [20])),
        "read": lambda: cmd_read(*rest[:2]),
        "media": lambda: cmd_media(*rest[:3]),
        "search": lambda: cmd_search(*rest[:2]),
        "check": lambda: cmd_check(*rest),
        "since": lambda: cmd_since(*rest[:2]),
        "mark": lambda: cmd_mark(),
    }.get(cmd, lambda: print(f"알 수 없는 명령: {cmd}\n{__doc__}"))()
