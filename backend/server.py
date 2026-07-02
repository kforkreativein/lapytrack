"""
Krish Computer Life Services — Combined Store Management API
Merges: INward-Outward (device ledger) + DayBook-Tracker (financial ledger)
Auth: single 4-digit PIN, bcrypt, JWT cookie (7 days)
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os, uuid, logging, io, csv, hashlib, re, asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import qrcode
import qrcode.image.svg
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response as FastAPIResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError
from pydantic import BaseModel, Field

# ── Config ──────────────────────────────────────────────────────────────────
MONGO_URL = os.environ.get('MONGO_URL') or os.environ.get('MONGODB_URI')
if not MONGO_URL:
    raise RuntimeError("Set MONGO_URL or MONGODB_URI to your MongoDB Atlas connection string.")
DB_NAME = os.environ.get('DB_NAME', 'krish_computer_db')
_INSECURE_JWT_DEFAULT = 'krish-computer-secret-change-me'
_IS_PROD = os.environ.get('RENDER') == 'true' or os.environ.get('ENV', '').lower() in ('production', 'prod')
MIN_PASSWORD_LEN = 10

def _load_jwt_secret() -> str:
    secret = (os.environ.get('JWT_SECRET') or '').strip()
    if not secret or secret == _INSECURE_JWT_DEFAULT:
        if os.environ.get('ALLOW_INSECURE_JWT') == '1':
            return secret or _INSECURE_JWT_DEFAULT
        raise RuntimeError(
            "Set JWT_SECRET to a random string of at least 32 characters. "
            "Local dev only: set ALLOW_INSECURE_JWT=1 in backend/.env."
        )
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 characters.")
    return secret

JWT_SECRET = _load_jwt_secret()
JWT_ALGORITHM = "HS256"
FRONTEND_URL = (os.environ.get('FRONTEND_URL') or 'https://lapy-track.vercel.app').rstrip('/')

# Rate-limit: lock account after this many consecutive failures
MAX_LOGIN_ATTEMPTS = 5
MAX_PIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
DEFAULT_SHOP_ID = os.environ.get("DEFAULT_SHOP_ID", "shop_default")
MAX_IMPORT_BYTES = int(os.environ.get("MAX_IMPORT_BYTES", str(5 * 1024 * 1024)))

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(
    title="Krish Computer Store API",
    docs_url=None if _IS_PROD else "/docs",
    redoc_url=None if _IS_PROD else "/redoc",
    openapi_url=None if _IS_PROD else "/openapi.json",
)
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

# ── Auth Helpers ─────────────────────────────────────────────────────────────
APP_CONFIG_ID = "main"
SHOP_USER_ID = "shop_owner"

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, name: str) -> str:
    payload = {"sub": user_id, "name": name,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def _cookie_flags() -> dict:
    """Cross-origin SPA (Vercel) + API (Render) needs SameSite=None + Secure."""
    local = FRONTEND_URL.startswith("http://localhost") or FRONTEND_URL.startswith("http://127.")
    if local:
        return {"secure": False, "samesite": "lax"}
    return {"secure": True, "samesite": "none"}

def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        "access_token", token, httponly=True, path="/", max_age=7 * 24 * 3600,
        **_cookie_flags(),
    )

def clear_auth_cookie(response: Response):
    response.delete_cookie("access_token", path="/", **_cookie_flags())

def _validate_password(password: str, field: str = "Password") -> None:
    if not password or len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(400, f"{field} must be at least {MIN_PASSWORD_LEN} characters")

async def get_app_config(shop_id: str | None = None):
    """Shop config: per-shop doc by shop_id, else legacy single-shop 'main' doc."""
    if shop_id and shop_id != APP_CONFIG_ID:
        cfg = await db.app_config.find_one({"shop_id": shop_id})
        if cfg:
            return cfg
        cfg = await db.app_config.find_one({"_id": shop_id})
        if cfg:
            return cfg
    return await db.app_config.find_one({"_id": APP_CONFIG_ID})

def _user_has_password(user: dict, cfg: dict | None) -> bool:
    if user.get("email_hash"):
        return True
    return bool(cfg and cfg.get("email_hash"))

def _public_user(user: dict, cfg: dict | None = None) -> dict:
    """Safe user payload for API responses, including has_email."""
    out = _safe_user(user)
    out["has_email"] = _user_has_password(user, cfg)
    out["email"] = user.get("email") or ((cfg or {}).get("email"))
    if cfg:
        out["shop_name"] = cfg.get("shop_name")
    elif user.get("name"):
        out["shop_name"] = user.get("name")
    return out

def user_shop_id(user: dict | None) -> str:
    return (user or {}).get("shop_id") or DEFAULT_SHOP_ID

def scoped_filter(user: dict, extra: Optional[dict] = None) -> dict:
    """Tenant filter that also sees legacy single-shop records without shop_id."""
    shop_id = user_shop_id(user)
    filt: dict = {"$and": [{"$or": [{"shop_id": shop_id}, {"shop_id": {"$exists": False}}]}]}
    if extra:
        filt["$and"].append(extra)
    return filt

def with_shop(user: dict, doc: dict) -> dict:
    doc["shop_id"] = user_shop_id(user)
    return doc

async def audit_log(action: str, user: Optional[dict] = None, target: Optional[dict] = None,
                    ok: bool = True, meta: Optional[dict] = None):
    entry = {
        "id": str(uuid.uuid4()),
        "action": action,
        "ok": ok,
        "shop_id": user_shop_id(user),
        "user_id": (user or {}).get("user_id"),
        "target": target or {},
        "meta": meta or {},
        "created_at": now_iso(),
    }
    try:
        await db.audit_logs.insert_one(entry)
    except Exception:
        logger.exception("Failed to write audit log for %s", action)

async def require_step_up(request: Request, user: dict, action: str):
    """Require current PIN or password for sensitive actions."""
    pin = request.headers.get("X-Step-Up-Pin", "")
    password = request.headers.get("X-Step-Up-Password", "")
    ok = False
    if pin and verify_password(pin, user.get("pin_hash", "")):
        ok = True
    if password and verify_password(password, user.get("email_hash", "")):
        ok = True
    if not ok:
        await audit_log(f"{action}.step_up_failed", user, ok=False)
        raise HTTPException(403, "Confirm your PIN or password to continue")

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if not user.get("shop_id"):
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"shop_id": DEFAULT_SHOP_ID}})
        user["shop_id"] = DEFAULT_SHOP_ID
    return user

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _safe_user(user: dict) -> dict:
    """Strip sensitive fields before returning user to API caller."""
    return {k: v for k, v in user.items()
            if k not in ("pin_hash", "email_hash", "locked_until",
                         "failed_login_attempts", "failed_pin_attempts")}

def _is_locked(user: dict) -> bool:
    lu = user.get("locked_until")
    return bool(lu and lu > now_iso())

async def _record_fail(user_id: str, field: str, max_attempts: int):
    result = await db.users.find_one({"user_id": user_id}, {field: 1})
    n = ((result or {}).get(field) or 0) + 1
    upd: dict = {"$set": {field: n}}
    if n >= max_attempts:
        lockout = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        upd["$set"]["locked_until"] = lockout  # type: ignore[index]
    await db.users.update_one({"user_id": user_id}, upd)

async def _clear_fail(user_id: str):
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"failed_login_attempts": 0, "failed_pin_attempts": 0, "locked_until": None}}
    )

def _build_date_range(period: Optional[str], start_date: Optional[str], end_date: Optional[str]) -> Optional[dict]:
    """Return a MongoDB date-range filter dict, or None for no filter."""
    if start_date or end_date:
        rng: dict = {}
        if start_date: rng["$gte"] = start_date
        if end_date:   rng["$lt"]  = end_date
        return rng
    now = datetime.now(timezone.utc)
    if period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "weekly":
        start = now - timedelta(days=7)
    elif period == "monthly":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period in ("annual", "yearly"):
        start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        return None
    return {"$gte": start.isoformat()}

def period_start(period: str) -> Optional[str]:
    now = datetime.now(timezone.utc)
    if period == "daily":
        return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if period == "weekly":
        return (now - timedelta(days=7)).isoformat()
    if period == "monthly":
        return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    if period in ("yearly", "annually", "annual"):
        return now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    return None

def generate_qr_svg(job_id: str) -> str:
    """Generate QR code as SVG string for a job card URL"""
    url = f"{FRONTEND_URL}/job/{job_id}"
    qr = qrcode.QRCode(version=1, box_size=10, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    factory = qrcode.image.svg.SvgPathImage
    img = qr.make_image(fill_color="black", back_color="white", image_factory=factory)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode('utf-8')

async def enrich_device(doc: dict | None) -> dict | None:
    """Return device with a fresh QR code (only while device is active, not after outward)."""
    if not doc:
        return doc
    out = dict(doc)
    device_id = out.get("device_id")
    # ponytail: run in thread so CPU-bound QR gen doesn't block asyncio event loop on Render's 0.1 vCPU
    if device_id and out.get("status") != "issued":
        try:
            out["qr_code"] = await asyncio.to_thread(generate_qr_svg, device_id)
        except Exception:
            out["qr_code"] = None
    else:
        out["qr_code"] = None
    return out

async def public_device_view(doc: dict) -> dict:
    enriched = await enrich_device(doc) or {}
    allowed = {
        "device_id", "job_number", "device_type", "brand", "model", "serial_number",
        "condition", "category", "customer_name", "customer_phone", "issue_categories",
        "issue_description", "status", "repair_status", "inward_date", "outward_date", "expected_return_date",
        "qr_code",
    }
    return {k: v for k, v in enriched.items() if k in allowed}

# ── Auth Models ──────────────────────────────────────────────────────────────
class PinSetupIn(BaseModel):
    shop_name: str
    pin: str
    email: Optional[str] = None
    password: Optional[str] = None

class PinLoginIn(BaseModel):
    pin: str

class EmailLoginIn(BaseModel):
    email: str
    password: str

class PinChangeIn(BaseModel):
    current_pin: str
    new_pin: str

class EmailPasswordUpdateIn(BaseModel):
    email: str
    password: str

class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str

# ── Auth Routes ──────────────────────────────────────────────────────────────
@api_router.get("/auth/setup-status")
async def setup_status():
    shop_count = await db.app_config.count_documents({})
    if shop_count == 0:
        return {"needs_setup": True, "has_email": False, "allow_register": False}
    has_email_user = await db.users.find_one(
        {"email_hash": {"$exists": True, "$ne": None}}, {"_id": 0, "email": 1}
    )
    legacy_cfg = await get_app_config()
    has_email = has_email_user is not None or bool(legacy_cfg and legacy_cfg.get("email_hash"))
    return {
        "needs_setup": False,
        "has_email": has_email,
        "allow_register": True,
    }

async def _create_shop_account(payload: PinSetupIn, response: Response, *, legacy_main: bool):
    if not payload.pin.isdigit() or len(payload.pin) != 4:
        raise HTTPException(400, "PIN must be exactly 4 digits")
    if not payload.shop_name.strip():
        raise HTTPException(400, "Shop name is required")
    if not payload.email or "@" not in payload.email:
        raise HTTPException(400, "A valid email is required")
    _validate_password(payload.password)
    email = payload.email.strip().lower()
    if await db.users.find_one({"email": email}, {"_id": 0, "user_id": 1}):
        raise HTTPException(400, "This email is already registered")
    t = now_iso()
    user_id = str(uuid.uuid4())
    shop_id = DEFAULT_SHOP_ID if legacy_main else str(uuid.uuid4())
    config_id = APP_CONFIG_ID if legacy_main else shop_id
    await db.app_config.insert_one({
        "_id": config_id,
        "shop_id": shop_id,
        "shop_name": payload.shop_name.strip(),
        "created_at": t,
    })
    user = {
        "user_id": user_id, "shop_id": shop_id, "name": payload.shop_name.strip(), "role": "admin",
        "email": email,
        "email_hash": hash_password(payload.password),
        "pin_hash": hash_password(payload.pin),
        "failed_login_attempts": 0, "failed_pin_attempts": 0, "locked_until": None,
        "created_at": t,
    }
    await db.users.insert_one(user)
    if not legacy_main:
        await _seed_shop_catalog(shop_id)
    token = create_token(user_id, payload.shop_name.strip())
    set_auth_cookie(response, token)
    cfg = await get_app_config(shop_id)
    return {"user": _public_user(user, cfg), "token": token}

@api_router.post("/auth/setup")
async def setup_pin(payload: PinSetupIn, response: Response):
    if await db.app_config.count_documents({}) > 0:
        raise HTTPException(400, "A shop already exists — use register to create another account")
    return await _create_shop_account(payload, response, legacy_main=True)

@api_router.post("/auth/register")
async def register_shop(payload: PinSetupIn, response: Response):
    if await db.app_config.count_documents({}) == 0:
        raise HTTPException(400, "No shops yet — use setup for the first account")
    return await _create_shop_account(payload, response, legacy_main=False)

@api_router.post("/auth/login-email")
async def login_email(payload: EmailLoginIn, response: Response):
    """Full login with email + password → JWT. Used on first visit or when cookie expires."""
    email = payload.email.strip().lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    # Generic message — don't reveal whether email exists
    email_hash = (user or {}).get("email_hash")
    if user and not email_hash:
        cfg = await get_app_config(user_shop_id(user))
        email_hash = (cfg or {}).get("email_hash")
    if not user or not email_hash:
        await audit_log("auth.login_email_failed", None, ok=False, meta={"email": email})
        raise HTTPException(401, "Incorrect email or password")
    if _is_locked(user):
        raise HTTPException(429, f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes.")
    if not verify_password(payload.password, email_hash):
        await _record_fail(user["user_id"], "failed_login_attempts", MAX_LOGIN_ATTEMPTS)
        await audit_log("auth.login_email_failed", user, ok=False)
        raise HTTPException(401, "Incorrect email or password")
    await _clear_fail(user["user_id"])
    cfg = await get_app_config(user_shop_id(user))
    token = create_token(user["user_id"], user.get("name", ""))
    set_auth_cookie(response, token)
    return {"user": _public_user(user, cfg), "token": token}

@api_router.post("/auth/login")
async def login_pin_disabled():
    """PIN cannot identify a shop account — use email sign-in."""
    raise HTTPException(
        400,
        "Sign in with your shop email and password. PIN is only for unlocking an active session.",
    )

@api_router.post("/auth/unlock-pin")
async def unlock_pin(payload: PinLoginIn, user: dict = Depends(get_current_user)):
    """Verify PIN for the already-signed-in user (Lock App / session timeout)."""
    if not payload.pin.isdigit() or len(payload.pin) != 4:
        raise HTTPException(400, "Invalid PIN")
    pin_hash = user.get("pin_hash") or ""
    if not pin_hash:
        cfg = await get_app_config(user_shop_id(user))
        pin_hash = (cfg or {}).get("pin_hash", "")
    if not pin_hash:
        raise HTTPException(400, "No PIN configured for this account")
    if _is_locked(user):
        raise HTTPException(429, f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes.")
    if not verify_password(payload.pin, pin_hash):
        await _record_fail(user["user_id"], "failed_pin_attempts", MAX_PIN_ATTEMPTS)
        await audit_log("auth.unlock_pin_failed", user, ok=False)
        raise HTTPException(401, "Incorrect PIN")
    await _clear_fail(user["user_id"])
    await audit_log("auth.unlock_pin", user)
    return {"ok": True}

@api_router.post("/auth/change-pin")
async def change_pin(payload: PinChangeIn, user: dict = Depends(get_current_user)):
    if not payload.new_pin.isdigit() or len(payload.new_pin) != 4:
        raise HTTPException(400, "New PIN must be 4 digits")
    pin_hash = user.get("pin_hash") or ""
    if not pin_hash:
        # Fallback for migrated user whose pin_hash is still in app_config
        cfg = await get_app_config(user_shop_id(user))
        pin_hash = (cfg or {}).get("pin_hash", "")
    if not verify_password(payload.current_pin, pin_hash):
        raise HTTPException(401, "Current PIN is incorrect")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"pin_hash": hash_password(payload.new_pin), "updated_at": now_iso()}}
    )
    await audit_log("auth.change_pin", user)
    return {"ok": True}

@api_router.post("/auth/change-password")
async def change_password(payload: PasswordChangeIn, user: dict = Depends(get_current_user)):
    _validate_password(payload.new_password, "New password")
    email_hash = user.get("email_hash") or ""
    if not email_hash:
        cfg = await get_app_config(user_shop_id(user))
        email_hash = (cfg or {}).get("email_hash", "")
    if not email_hash:
        raise HTTPException(400, "No password configured")
    if not verify_password(payload.current_password, email_hash):
        raise HTTPException(401, "Current password is incorrect")
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"email_hash": hash_password(payload.new_password), "updated_at": now_iso()}}
    )
    await audit_log("auth.change_password", user)
    return {"ok": True}

@api_router.post("/auth/email-password")
async def set_email_password(payload: EmailPasswordUpdateIn, user: dict = Depends(get_current_user)):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "Enter a valid email")
    _validate_password(payload.password)
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"email": email, "email_hash": hash_password(payload.password), "updated_at": now_iso()}}
    )
    await audit_log("auth.set_email_password", user)
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    cfg = await get_app_config(user_shop_id(updated))
    return {"ok": True, "email": email, "user": _public_user(updated, cfg)}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    cfg = await get_app_config(user_shop_id(user))
    return _public_user(user, cfg)

@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}

# ── Device Models ─────────────────────────────────────────────────────────────
class DeviceIn(BaseModel):
    device_type: str
    brand: str
    model: str
    serial_number: Optional[str] = None
    condition: str
    category: str = "repair"
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = ""
    issue_categories: List[str] = []
    issue_description: Optional[str] = ""
    repair_status: Optional[str] = "not_started"
    repair_cost: Optional[float] = None

class DeviceUpdate(BaseModel):
    device_type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    condition: Optional[str] = None
    category: Optional[str] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    issue_description: Optional[str] = None
    status: Optional[str] = None
    repair_status: Optional[str] = None

class MovementIn(BaseModel):
    device_id: str
    movement_type: str
    pickup_self: Optional[bool] = True
    picked_up_by_name: Optional[str] = ""
    picked_up_by_phone: Optional[str] = ""
    expected_return_date: Optional[str] = None
    remarks: Optional[str] = ""
    repair_charge: Optional[float] = None
    repair_payment_method: Optional[str] = "Cash"
    repair_on_credit: Optional[bool] = False

# ── Device Routes ─────────────────────────────────────────────────────────────
async def generate_job_number() -> str:
    now = datetime.now(timezone.utc)
    prefix = f"JOB-{now.strftime('%Y%m')}"
    counter = await db.counters.find_one_and_update(
        {"_id": prefix}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    return f"{prefix}-{(counter['seq'] if counter else 1):04d}"

@api_router.post("/devices")
async def create_device(payload: DeviceIn, user: dict = Depends(get_current_user)):
    sn = payload.serial_number.strip().upper() if payload.serial_number and payload.serial_number.strip() else None
    if sn and await db.devices.find_one(scoped_filter(user, {"serial_number": sn})):
        raise HTTPException(400, "Serial number already exists")
    device_id = f"dev_{uuid.uuid4().hex[:12]}"
    job_number = await generate_job_number()
    t = now_iso()
    doc = {
        "device_id": device_id, "job_number": job_number,
        "device_type": payload.device_type, "brand": payload.brand,
        "model": payload.model, "serial_number": sn,
        "condition": payload.condition, "category": payload.category,
        "customer_name": payload.customer_name, "customer_phone": payload.customer_phone,
        "customer_email": payload.customer_email or "",
        "issue_categories": payload.issue_categories or [],
        "issue_description": payload.issue_description or "",
        # ponytail: QR not stored — enrich_device regenerates it on every read, saving ~6KB/device
        "status": "in_stock" if payload.category == "stock" else "in_repair",
        "repair_status": payload.repair_status or "not_started",
        "repair_cost": payload.repair_cost,
        "inward_date": t, "outward_date": None, "created_by": user["user_id"],
        "created_at": t, "updated_at": t,
    }
    try:
        await db.devices.insert_one(with_shop(user, doc))
    except DuplicateKeyError:
        raise HTTPException(400, "A device with this serial number already exists")
    await db.movements.insert_one(with_shop(user, {
        "movement_id": f"mov_{uuid.uuid4().hex[:12]}", "device_id": device_id,
        "job_number": job_number, "movement_type": "inward",
        "customer_name": payload.customer_name, "customer_phone": payload.customer_phone,
        "issue_description": payload.issue_description, "remarks": "",
        "performed_by": user["user_id"], "performed_by_name": user.get("name", ""),
        "created_at": t,
    }))
    doc.pop("_id", None)
    return {**doc, "qr_code": None}

@api_router.get("/devices")
async def list_devices(status: Optional[str] = None, category: Optional[str] = None,
                       q: Optional[str] = None, user: dict = Depends(get_current_user)):
    filt = {}
    if status: filt["status"] = status
    if category: filt["category"] = category
    if q:
        q = q.strip()[:100]
        if q:
            safe_q = re.escape(q)
            filt["$or"] = [
                {"serial_number": {"$regex": safe_q, "$options": "i"}},
                {"brand": {"$regex": safe_q, "$options": "i"}},
                {"model": {"$regex": safe_q, "$options": "i"}},
                {"customer_name": {"$regex": safe_q, "$options": "i"}},
                {"customer_phone": {"$regex": safe_q, "$options": "i"}},
                {"job_number": {"$regex": safe_q, "$options": "i"}},
            ]
    devices = await db.devices.find(scoped_filter(user, filt), {"_id": 0}).sort("created_at", -1).to_list(1000)
    return list(await asyncio.gather(*[enrich_device(d) for d in devices]))

@api_router.get("/devices/export/csv")
async def export_csv(
    request: Request,
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    filt: dict = {}
    date_rng = _build_date_range(period, start_date, end_date)
    if date_rng:
        filt["inward_date"] = date_rng
    devices = await db.devices.find(scoped_filter(user, filt), {"_id": 0}).sort("created_at", -1).to_list(5000)
    await audit_log("export.devices_csv", user, meta={"count": len(devices)})
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Job No.", "Serial No.", "Type", "Brand", "Model", "Condition", "Category",
                "Status", "Customer", "Phone", "Issue/Notes", "Inward Date", "Outward Date",
                "Picked Up By", "Pickup Phone", "Expected Return"])
    for d in devices:
        w.writerow([d.get(k, "") or "" for k in [
            "job_number","serial_number","device_type","brand","model","condition","category",
            "status","customer_name","customer_phone","issue_description",
            "inward_date","outward_date","picked_up_by_name","picked_up_by_phone","expected_return_date"
        ]])
    out.seek(0)
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="devices.csv"'})

@api_router.get("/devices/{device_id}")
async def get_device(device_id: str, user: dict = Depends(get_current_user)):
    doc = await db.devices.find_one(scoped_filter(user, {"device_id": device_id}), {"_id": 0})
    if not doc: raise HTTPException(404, "Device not found")
    return await enrich_device(doc)

@api_router.get("/public/job/{device_id}")
async def get_job_public(device_id: str):
    """Public route — no auth required. Used by QR code scans."""
    doc = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Device not found")
    return await public_device_view(doc)

@api_router.patch("/devices/{device_id}")
async def update_device(device_id: str, payload: DeviceUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "serial_number" in data: data["serial_number"] = data["serial_number"].upper()
    data["updated_at"] = now_iso()
    result = await db.devices.update_one(scoped_filter(user, {"device_id": device_id}), {"$set": data})
    if result.matched_count == 0: raise HTTPException(404, "Device not found")
    doc = await db.devices.find_one(scoped_filter(user, {"device_id": device_id}), {"_id": 0})
    return await enrich_device(doc)

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(get_current_user)):
    await db.devices.delete_one(scoped_filter(user, {"device_id": device_id}))
    await db.movements.delete_many(scoped_filter(user, {"device_id": device_id}))
    await audit_log("delete.device", user, {"device_id": device_id})
    return {"ok": True}

@api_router.post("/movements")
async def create_movement(payload: MovementIn, user: dict = Depends(get_current_user)):
    device = await db.devices.find_one(scoped_filter(user, {"device_id": payload.device_id}), {"_id": 0})
    if not device: raise HTTPException(404, "Device not found")
    mt = payload.movement_type
    if mt not in ("inward", "outward"): raise HTTPException(400, "movement_type must be inward or outward")
    if mt == "outward":
        if device["status"] not in ("in_stock", "in_repair"):
            raise HTTPException(400, f"Device already issued (status={device['status']})")
        new_status = "issued"
        picker_name = device.get("customer_name", "") if payload.pickup_self else (payload.picked_up_by_name or "")
        picker_phone = device.get("customer_phone", "") if payload.pickup_self else (payload.picked_up_by_phone or "")
        pickup_rel = "self" if payload.pickup_self else "delegate"
    else:
        new_status = "in_stock" if device.get("category") == "stock" else "in_repair"
        picker_name = picker_phone = pickup_rel = ""

    t = now_iso()
    await db.movements.insert_one(with_shop(user, {
        "movement_id": f"mov_{uuid.uuid4().hex[:12]}", "device_id": payload.device_id,
        "job_number": device.get("job_number"), "movement_type": mt,
        "customer_name": device.get("customer_name", ""), "customer_phone": device.get("customer_phone", ""),
        "picked_up_by_name": picker_name, "picked_up_by_phone": picker_phone,
        "pickup_relationship": pickup_rel, "expected_return_date": payload.expected_return_date,
        "remarks": payload.remarks or "", "performed_by": user["user_id"],
        "performed_by_name": user.get("name", ""), "created_at": t,
    }))
    update = {"status": new_status, "updated_at": t}
    if mt == "outward":
        update.update({"picked_up_by_name": picker_name, "picked_up_by_phone": picker_phone,
                       "pickup_relationship": pickup_rel, "expected_return_date": payload.expected_return_date,
                       "outward_date": t})
    else:
        update.update({"inward_date": t, "picked_up_by_name": "", "picked_up_by_phone": "",
                       "pickup_relationship": "", "expected_return_date": None})
    await db.devices.update_one(scoped_filter(user, {"device_id": payload.device_id}), {"$set": update})

    # Auto-create ledger income entry for repair charge on outward
    if mt == "outward" and payload.repair_charge and payload.repair_charge > 0:
        cust_name = device.get("customer_name", "").strip()
        cust_phone = device.get("customer_phone", "").strip() or None
        customer_id = None
        if cust_name:
            existing = await db.customers.find_one(scoped_filter(user, {"name": {"$regex": f"^{re.escape(cust_name)}$", "$options": "i"}}), {"_id": 0})
            if not existing:
                existing = {"id": str(uuid.uuid4()), "name": cust_name, "phone": cust_phone,
                            "note": None, "created_at": t}
                await db.customers.insert_one(with_shop(user, existing))
            customer_id = existing["id"]
        on_credit = bool(payload.repair_on_credit)
        txn = {"id": str(uuid.uuid4()), "amount": round(payload.repair_charge, 2),
               "type": "credit", "category": "Repair Income",
               "note": f"Repair charge – {device.get('brand','')} {device.get('model','')} ({device.get('job_number','')})".strip(" –()"),
               "payment_method": "On Credit" if on_credit else (payload.repair_payment_method or "Cash"),
               "customer_id": customer_id, "date": t, "created_at": t,
               "on_credit": on_credit, "amount_paid": 0.0, "payments": []}
        await db.transactions.insert_one(with_shop(user, txn))

    doc = await db.devices.find_one(scoped_filter(user, {"device_id": payload.device_id}), {"_id": 0})
    return {**(doc or {}), "qr_code": None}

@api_router.get("/movements")
async def list_movements(device_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    filt = {"device_id": device_id} if device_id else {}
    return await db.movements.find(scoped_filter(user, filt), {"_id": 0}).sort("created_at", -1).to_list(2000)

@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    total = await db.devices.count_documents(scoped_filter(user))
    in_stock = await db.devices.count_documents(scoped_filter(user, {"status": "in_stock"}))
    issued = await db.devices.count_documents(scoped_filter(user, {"status": "issued"}))
    in_repair = await db.devices.count_documents(scoped_filter(user, {"status": "in_repair"}))
    laptops = await db.devices.count_documents(scoped_filter(user, {"device_type": "Laptop"}))
    desktops = await db.devices.count_documents(scoped_filter(user, {"device_type": "Desktop"}))
    overdue = await db.devices.count_documents(scoped_filter(user, {
        "status": "issued", "expected_return_date": {"$lt": now_iso(), "$ne": None}}))
    monthly_inward = await db.movements.count_documents(scoped_filter(user, {"movement_type": "inward", "created_at": {"$gte": month_start}}))
    monthly_outward = await db.movements.count_documents(scoped_filter(user, {"movement_type": "outward", "created_at": {"$gte": month_start}}))
    recent = await db.movements.find(scoped_filter(user), {"_id": 0}).sort("created_at", -1).to_list(8)
    # Repair status counts (only for active/in-repair devices)
    rs_not_started = await db.devices.count_documents(scoped_filter(user, {"status": {"$ne": "issued"}, "repair_status": {"$in": ["not_started", None]}}))
    rs_in_progress = await db.devices.count_documents(scoped_filter(user, {"status": {"$ne": "issued"}, "repair_status": "in_progress"}))
    rs_completed   = await db.devices.count_documents(scoped_filter(user, {"status": {"$ne": "issued"}, "repair_status": "completed"}))
    rs_delivered   = await db.devices.count_documents(scoped_filter(user, {"$or": [{"repair_status": "delivered"}, {"status": "issued"}]}))
    return {"total": total, "in_stock": in_stock, "issued": issued, "in_repair": in_repair,
            "overdue": overdue, "laptops": laptops, "desktops": desktops,
            "monthly_inward": monthly_inward, "monthly_outward": monthly_outward,
            "recent_movements": recent,
            "rs_not_started": rs_not_started, "rs_in_progress": rs_in_progress,
            "rs_completed": rs_completed, "rs_delivered": rs_delivered}

# ── Photo Upload (disabled) ───────────────────────────────────────────────────
# Photo feature removed to preserve MongoDB Atlas free-tier storage (512 MB).
# Re-enable with Cloudinary integration when storage is upgraded.
@api_router.post("/upload")
async def upload_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    raise HTTPException(410, "Photo upload is currently disabled")

# ── Ledger: Customers ─────────────────────────────────────────────────────────
DEFAULT_CATEGORIES = [
    {"name": "Sales", "icon": "ShoppingCart", "color": "#16A34A", "type": "credit"},
    {"name": "Repair Payment", "icon": "Wrench", "color": "#16A34A", "type": "credit"},
    {"name": "Advance", "icon": "HandCoins", "color": "#16A34A", "type": "credit"},
    {"name": "Rent Income", "icon": "Building", "color": "#16A34A", "type": "credit"},
    {"name": "Parts Purchase", "icon": "Package", "color": "#DC2626", "type": "debit"},
    {"name": "Office Expense", "icon": "Briefcase", "color": "#DC2626", "type": "debit"},
    {"name": "Salary", "icon": "Users", "color": "#DC2626", "type": "debit"},
    {"name": "Utilities", "icon": "Zap", "color": "#DC2626", "type": "debit"},
    {"name": "Personal Expense", "icon": "User", "color": "#DC2626", "type": "debit"},
    {"name": "Other", "icon": "MoreHorizontal", "color": "#6B7280", "type": "both"},
]

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    avatar_color: Optional[str] = "#E5E7EB"

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    avatar_color: Optional[str] = None

class BulkCustomerRequest(BaseModel):
    contacts: List[CustomerCreate]

class TransactionCreate(BaseModel):
    amount: float
    type: Literal["credit", "debit"]
    category: Optional[str] = "Other"
    note: Optional[str] = None
    customer_id: Optional[str] = None
    date: Optional[str] = None
    payment_method: Optional[str] = "Cash"
    on_credit: bool = False  # pay later — entry recorded but cash not counted until payment received

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[Literal["credit", "debit"]] = None
    category: Optional[str] = None
    note: Optional[str] = None
    date: Optional[str] = None
    payment_method: Optional[str] = None
    on_credit: Optional[bool] = None

class PaymentRecord(BaseModel):
    amount: float
    payment_method: Optional[str] = "Cash"
    date: Optional[str] = None
    note: Optional[str] = None

def txn_balance_contribution(txn: dict) -> float:
    """Outstanding balance effect of a transaction."""
    amount = float(txn.get("amount") or 0)
    paid = float(txn.get("amount_paid") or 0)
    if txn.get("on_credit"):
        remaining = max(0, amount - paid)
        return remaining if txn.get("type") == "credit" else -remaining
    return amount if txn.get("type") == "credit" else -amount

def txn_cash_on_day(txn: dict, day_start: str, day_end: str, for_type: str) -> float:
    """Cash-flow amount counted on a given day for income/expense totals."""
    if txn.get("type") != for_type:
        return 0
    if txn.get("on_credit"):
        return sum(
            float(p.get("amount") or 0)
            for p in txn.get("payments") or []
            if day_start <= (p.get("date") or "") < day_end
        )
    d = txn.get("date") or ""
    return float(txn.get("amount") or 0) if day_start <= d < day_end else 0

class CategoryCreate(BaseModel):
    name: str
    icon: Optional[str] = "MoreHorizontal"
    color: Optional[str] = "#6B7280"
    type: Literal["credit", "debit", "both"] = "both"

class ReminderCreate(BaseModel):
    customer_id: Optional[str] = None
    title: str
    due_date: str
    amount: Optional[float] = None

@api_router.get("/customers")
async def list_customers(user: dict = Depends(get_current_user)):
    customers = await db.customers.find(scoped_filter(user), {"_id": 0}).sort("name", 1).to_list(2000)
    agg = await db.transactions.aggregate([
        {"$match": scoped_filter(user, {"customer_id": {"$ne": None}})},
        {"$project": {
            "customer_id": 1,
            "type": 1,
            "contrib": {
                "$cond": [
                    {"$eq": [{"$ifNull": ["$on_credit", False]}, True]},
                    {"$max": [0, {"$subtract": [
                        {"$ifNull": ["$amount", 0]},
                        {"$ifNull": ["$amount_paid", 0]},
                    ]}]},
                    {"$ifNull": ["$amount", 0]},
                ]
            },
        }},
        {"$group": {
            "_id": {"customer_id": "$customer_id", "type": "$type"},
            "total": {"$sum": "$contrib"},
        }},
    ]).to_list(10000)
    by_customer: dict = {}
    for row in agg:
        cid = row["_id"]["customer_id"]
        typ = row["_id"]["type"]
        by_customer.setdefault(cid, {"credit": 0.0, "debit": 0.0})
        by_customer[cid][typ] = float(row.get("total") or 0)
    out = []
    for c in customers:
        totals = by_customer.get(c["id"], {"credit": 0.0, "debit": 0.0})
        balance = round(totals["credit"] - totals["debit"], 2)
        c["balance"] = balance
        c["total_credit"] = round(totals["credit"], 2)
        c["total_debit"] = round(totals["debit"], 2)
        out.append(c)
    return out

@api_router.post("/customers")
async def create_customer(body: CustomerCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name, "phone": body.phone,
           "email": body.email, "note": body.note, "avatar_color": body.avatar_color or "#E5E7EB", "created_at": now_iso()}
    await db.customers.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.post("/customers/bulk")
async def create_customers_bulk(body: BulkCustomerRequest, user: dict = Depends(get_current_user)):
    existing = await db.customers.find(scoped_filter(user), {"_id": 0, "name": 1, "phone": 1}).to_list(5000)
    keys = {(c.get("name","").lower().strip(), (c.get("phone") or "").replace(" ","").replace("-","")) for c in existing}
    added = 0
    for item in body.contacts:
        name = item.name.strip()
        if not name: continue
        phone = (item.phone or "").replace(" ","").replace("-","")
        if (name.lower(), phone) in keys: continue
        keys.add((name.lower(), phone))
        doc = {"id": str(uuid.uuid4()), "name": name, "phone": item.phone or None,
               "note": item.note, "avatar_color": "#E5E7EB", "created_at": now_iso()}
        await db.customers.insert_one(with_shop(user, doc))
        added += 1
    return {"added": added}

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    doc = await db.customers.find_one(scoped_filter(user, {"id": customer_id}), {"_id": 0})
    if not doc: raise HTTPException(404, "Customer not found")
    return doc

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        res = await db.customers.update_one(scoped_filter(user, {"id": customer_id}), {"$set": update})
        if res.matched_count == 0: raise HTTPException(404, "Customer not found")
    return await db.customers.find_one(scoped_filter(user, {"id": customer_id}), {"_id": 0})

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    res = await db.customers.delete_one(scoped_filter(user, {"id": customer_id}))
    if res.deleted_count == 0: raise HTTPException(404, "Customer not found")
    await db.transactions.delete_many(scoped_filter(user, {"customer_id": customer_id}))
    await audit_log("delete.customer", user, {"customer_id": customer_id})
    return {"ok": True}

@api_router.get("/customers/export/csv")
async def export_customers_csv(request: Request, user: dict = Depends(get_current_user)):
    customers = await db.customers.find(scoped_filter(user), {"_id": 0}).sort("name", 1).to_list(10000)
    await audit_log("export.customers_csv", user, meta={"count": len(customers)})
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Phone", "Email", "Note", "Created At"])
    for c in customers:
        w.writerow([c.get("name",""), c.get("phone",""), c.get("email",""), c.get("note",""), c.get("created_at","")])
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="contacts.csv"'})

@api_router.get("/customers/outstanding/csv")
async def export_outstanding_csv(user: dict = Depends(get_current_user)):
    customers = await db.customers.find(scoped_filter(user), {"_id": 0}).sort("name", 1).to_list(10000)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Phone", "Amount", "Type"])
    for c in customers:
        balance = c.get("balance", 0) or 0
        if balance == 0: continue
        type_label = "Receivable (You'll Get)" if balance > 0 else "Payable (You'll Give)"
        w.writerow([c.get("name",""), c.get("phone",""), abs(balance), type_label])
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="outstanding.csv"'})

# ── Ledger: Transactions ──────────────────────────────────────────────────────
@api_router.get("/transactions")
async def list_transactions(customer_id: Optional[str] = None, type: Optional[str] = None,
                            personal: Optional[bool] = None, limit: int = 200,
                            period: Optional[str] = None,
                            start_date: Optional[str] = None, end_date: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
    q = {}
    if customer_id is not None: q["customer_id"] = customer_id
    if type: q["type"] = type
    if personal is True: q["customer_id"] = None
    date_filter = {}
    if start_date:
        date_filter["$gte"] = start_date
    if end_date:
        date_filter["$lt"] = end_date
    if date_filter:
        q["date"] = date_filter
    else:
        start = period_start(period or "")
        if start: q["date"] = {"$gte": start}
    safe_limit = max(1, min(limit, 1000))
    return await db.transactions.find(scoped_filter(user, q), {"_id": 0}).sort("date", -1).to_list(safe_limit)

@api_router.get("/transactions/{txn_id}")
async def get_transaction(txn_id: str, user: dict = Depends(get_current_user)):
    doc = await db.transactions.find_one(scoped_filter(user, {"id": txn_id}), {"_id": 0})
    if not doc:
        raise HTTPException(404, "Transaction not found")
    return doc

@api_router.post("/customers/import-file")
async def import_contacts_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    size = int(file.headers.get("content-length") or 0)
    if size and size > MAX_IMPORT_BYTES:
        raise HTTPException(413, f"File is too large. Upload a CSV/VCF under {MAX_IMPORT_BYTES // (1024 * 1024)} MB.")
    content = await file.read()
    if len(content) > MAX_IMPORT_BYTES:
        raise HTTPException(413, f"File is too large. Upload a CSV/VCF under {MAX_IMPORT_BYTES // (1024 * 1024)} MB.")
    text = content.decode("utf-8", errors="replace")
    filename = (file.filename or "").lower()
    contacts = []

    if filename.endswith(".vcf") or filename.endswith(".vcard"):
        # Unfold RFC 2425 continuation lines (lines starting with space/tab)
        unfolded = re.sub(r"\r?\n[ \t]", "", text)
        for card in re.split(r"BEGIN:VCARD", unfolded, flags=re.I):
            if not card.strip(): continue
            name = phone = None
            for line in card.splitlines():
                line = line.strip()
                if not line: continue
                # FN field (may have params like FN;CHARSET=UTF-8:)
                m = re.match(r"FN(?:;[^:]*)?:(.*)", line, re.I)
                if m and not name:
                    name = m.group(1).strip()
                    continue
                # TEL field — take first number found
                m = re.match(r"TEL(?:;[^:]*)?:(.*)", line, re.I)
                if m and not phone:
                    raw = m.group(1).strip()
                    # Handle tel: URI scheme (VCF 4.0)
                    raw = re.sub(r"^tel:", "", raw, flags=re.I)
                    phone = re.sub(r"[^\d+]", "", raw) or None
            if name and name.strip():
                contacts.append({"name": name.strip(), "phone": phone})
    elif filename.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            name = (row.get("Name") or row.get("name") or row.get("First Name") or "").strip()
            last = (row.get("Last Name") or "").strip()
            if last: name = f"{name} {last}".strip()
            phone = (
                row.get("Phone") or row.get("Mobile") or row.get("Mobile Phone") or
                row.get("phone") or row.get("Phone 1 - Value") or ""
            ).strip() or None
            if name:
                contacts.append({"name": name, "phone": phone})
    else:
        raise HTTPException(400, "Unsupported file. Upload a .csv or .vcf file")

    existing = await db.customers.find(scoped_filter(user), {"_id": 0, "name": 1, "phone": 1}).to_list(10000)
    # Deduplicate by name OR phone — preserves manually-added contacts
    existing_names = {c.get("name","").lower().strip() for c in existing}
    existing_phones = {(c.get("phone") or "").replace(" ","").replace("-","") for c in existing if c.get("phone")}
    added = 0
    for item in contacts:
        name = item["name"].strip()
        if not name: continue
        norm_phone = (item.get("phone") or "").replace(" ","").replace("-","")
        if name.lower() in existing_names: continue
        if norm_phone and norm_phone in existing_phones: continue
        existing_names.add(name.lower())
        if norm_phone: existing_phones.add(norm_phone)
        await db.customers.insert_one(with_shop(user, {"id": str(uuid.uuid4()), "name": name,
            "phone": item.get("phone"), "note": None, "avatar_color": "#E5E7EB", "created_at": now_iso()}))
        added += 1
    return {"added": added, "total": len(contacts), "skipped": len(contacts) - added}

@api_router.post("/transactions")
async def create_transaction(body: TransactionCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "amount": body.amount, "type": body.type,
           "category": body.category or "Other", "note": body.note,
           "payment_method": body.payment_method or "Cash",
           "customer_id": body.customer_id, "date": body.date or now_iso(), "created_at": now_iso(),
           "on_credit": body.on_credit, "amount_paid": 0.0, "payments": []}
    await db.transactions.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, body: TransactionUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if update:
        res = await db.transactions.update_one(scoped_filter(user, {"id": txn_id}), {"$set": update})
        if res.matched_count == 0: raise HTTPException(404, "Transaction not found")
    return await db.transactions.find_one(scoped_filter(user, {"id": txn_id}), {"_id": 0})

@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one(scoped_filter(user, {"id": txn_id}))
    if res.deleted_count == 0: raise HTTPException(404, "Transaction not found")
    await audit_log("delete.transaction", user, {"txn_id": txn_id})
    return {"ok": True}

@api_router.post("/transactions/{txn_id}/payments")
async def record_payment(txn_id: str, body: PaymentRecord, user: dict = Depends(get_current_user)):
    txn = await db.transactions.find_one(scoped_filter(user, {"id": txn_id}), {"_id": 0})
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if not txn.get("on_credit"):
        raise HTTPException(400, "This transaction is not on credit")
    amount = float(body.amount)
    if amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    paid = float(txn.get("amount_paid") or 0)
    remaining = float(txn.get("amount") or 0) - paid
    if amount > remaining + 0.01:
        raise HTTPException(400, f"Amount exceeds remaining balance (₹{remaining:.2f})")
    payment = {
        "id": str(uuid.uuid4()),
        "amount": amount,
        "payment_method": body.payment_method or "Cash",
        "date": body.date or now_iso(),
        **({"note": body.note} if body.note else {}),
    }
    new_paid = round(paid + amount, 2)
    await db.transactions.update_one(
        scoped_filter(user, {"id": txn_id}),
        {"$push": {"payments": payment}, "$set": {"amount_paid": new_paid}},
    )
    return await db.transactions.find_one(scoped_filter(user, {"id": txn_id}), {"_id": 0})

@api_router.delete("/transactions/{txn_id}/payments/last")
async def undo_last_payment(txn_id: str, user: dict = Depends(get_current_user)):
    txn = await db.transactions.find_one(scoped_filter(user, {"id": txn_id}), {"_id": 0})
    if not txn:
        raise HTTPException(404, "Transaction not found")
    payments = txn.get("payments") or []
    if not payments:
        raise HTTPException(400, "No payments to undo")
    last = payments[-1]
    new_paid = round(float(txn.get("amount_paid") or 0) - float(last.get("amount") or 0), 2)
    await db.transactions.update_one(
        scoped_filter(user, {"id": txn_id}),
        {"$pop": {"payments": 1}, "$set": {"amount_paid": max(0, new_paid)}},
    )
    return await db.transactions.find_one(scoped_filter(user, {"id": txn_id}), {"_id": 0})

@api_router.get("/transactions/export/csv")
async def export_transactions_csv(
    request: Request,
    period: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    q: dict = {}
    date_rng = _build_date_range(period, start_date, end_date)
    if date_rng:
        q["date"] = date_rng
    txns = await db.transactions.find(scoped_filter(user, q), {"_id": 0}).sort("date", -1).to_list(50000)
    customer_ids = list({t.get("customer_id") for t in txns if t.get("customer_id")})
    customers = await db.customers.find(scoped_filter(user, {"id": {"$in": customer_ids}}), {"_id": 0, "id": 1, "name": 1}).to_list(5000)
    await audit_log("export.transactions_csv", user, meta={"count": len(txns)})
    cmap = {c["id"]: c["name"] for c in customers}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Date", "Type", "Amount", "Customer", "Category", "Payment Method", "Note", "On Credit", "Amount Paid"])
    for t in txns:
        w.writerow([t.get("date",""), t.get("type",""), t.get("amount",""),
                    cmap.get(t.get("customer_id",""),""), t.get("category",""),
                    t.get("payment_method",""), t.get("note",""),
                    "Yes" if t.get("on_credit") else "No", t.get("amount_paid", "")])
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ledger.csv"'})

# ── Ledger: Categories ────────────────────────────────────────────────────────
@api_router.get("/categories")
async def list_categories(type: Optional[str] = None, user: dict = Depends(get_current_user)):
    cats = await db.categories.find(scoped_filter(user), {"_id": 0}).to_list(500)
    if not cats or any("type" not in c for c in cats):
        await db.categories.delete_many(scoped_filter(user))
        cats = [with_shop(user, {"id": str(uuid.uuid4()), **c}) for c in DEFAULT_CATEGORIES]
        await db.categories.insert_many(cats)
        cats = [{k: v for k, v in c.items() if k != "_id"} for c in cats]
    if type in ("credit", "debit"):
        cats = [c for c in cats if c.get("type") in (type, "both")]
    return cats

@api_router.post("/categories")
async def create_category(body: CategoryCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name, "icon": body.icon,
           "color": body.color, "type": body.type}
    await db.categories.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryCreate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in {"name": body.name, "type": body.type, "icon": body.icon, "color": body.color}.items() if v is not None}
    res = await db.categories.update_one(scoped_filter(user, {"id": cat_id}), {"$set": update})
    if res.matched_count == 0: raise HTTPException(404, "Category not found")
    return await db.categories.find_one(scoped_filter(user, {"id": cat_id}), {"_id": 0})

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(get_current_user)):
    res = await db.categories.delete_one(scoped_filter(user, {"id": cat_id}))
    if res.deleted_count == 0: raise HTTPException(404, "Category not found")
    return {"ok": True}

# ── Ledger: Reminders ─────────────────────────────────────────────────────────
@api_router.get("/reminders")
async def list_reminders(user: dict = Depends(get_current_user)):
    return await db.reminders.find(scoped_filter(user), {"_id": 0}).sort("due_date", 1).to_list(500)

@api_router.post("/reminders")
async def create_reminder(body: ReminderCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "customer_id": body.customer_id, "title": body.title,
           "due_date": body.due_date, "amount": body.amount, "completed": False, "created_at": now_iso()}
    await db.reminders.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.put("/reminders/{reminder_id}")
async def toggle_reminder(reminder_id: str, completed: bool = True, user: dict = Depends(get_current_user)):
    res = await db.reminders.update_one(scoped_filter(user, {"id": reminder_id}), {"$set": {"completed": completed}})
    if res.matched_count == 0: raise HTTPException(404, "Reminder not found")
    return {"ok": True}

@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, user: dict = Depends(get_current_user)):
    res = await db.reminders.delete_one(scoped_filter(user, {"id": reminder_id}))
    if res.deleted_count == 0: raise HTTPException(404, "Reminder not found")
    return {"ok": True}

# ── Ledger: Reports ───────────────────────────────────────────────────────────
@api_router.get("/reports/summary")
async def reports_summary(period: str = "monthly",
                          start_date: Optional[str] = None,
                          end_date: Optional[str] = None,
                          user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    # If frontend passes explicit bounds (local-time-aware), use them
    if start_date:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00")) if start_date.endswith("Z") else datetime.fromisoformat(start_date)
        if start.tzinfo is None: start = start.replace(tzinfo=timezone.utc)
        end_dt = None
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00")) if end_date.endswith("Z") else datetime.fromisoformat(end_date)
            if end_dt.tzinfo is None: end_dt = end_dt.replace(tzinfo=timezone.utc)
        days = max(1, (end_dt - start).days) if end_dt else 1
    else:
        if period == "daily":
            days = 1
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "weekly":
            days = 7
            start = now - timedelta(days=7)
        elif period == "yearly":
            days = 365
            start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else:
            days = 30
            start = now - timedelta(days=30)
    txns = await db.transactions.find(scoped_filter(user, {"date": {"$gte": start.isoformat()}}), {"_id": 0}).to_list(5000)
    series = []
    for i in range(days):
        day_start = start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        ds, de = day_start.isoformat(), day_end.isoformat()
        credit = sum(txn_cash_on_day(t, ds, de, "credit") for t in txns)
        debit = sum(txn_cash_on_day(t, ds, de, "debit") for t in txns)
        series.append({"label": day_start.strftime("%d/%m"), "credit": round(credit, 2), "debit": round(debit, 2)})
    cat_map = {}
    for t in txns:
        c = t.get("category", "Other")
        if c not in cat_map: cat_map[c] = {"category": c, "credit": 0.0, "debit": 0.0}
        # Category totals: use full amounts for non-credit; paid amounts for on-credit
        if t.get("on_credit"):
            paid = float(t.get("amount_paid") or 0)
            cat_map[c][t["type"]] += paid
        else:
            cat_map[c][t["type"]] += t["amount"]
    total_credit = sum(
        float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
        for t in txns if t["type"] == "credit"
    )
    total_debit = sum(
        float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
        for t in txns if t["type"] == "debit"
    )
    return {"period": period, "total_credit": round(total_credit, 2), "total_debit": round(total_debit, 2),
            "net": round(total_credit - total_debit, 2), "series": series,
            "by_category": list(cat_map.values())}

@api_router.get("/reports/advanced")
async def reports_advanced(period: str = "monthly", start_date: Optional[str] = None,
                           end_date: Optional[str] = None, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if start_date:
        start = datetime.fromisoformat(start_date.replace("Z", "+00:00") if start_date.endswith("Z") else start_date)
        if start.tzinfo is None: start = start.replace(tzinfo=timezone.utc)
    else:
        if period == "daily": start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "weekly": start = now - timedelta(days=7)
        elif period == "yearly": start = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        else: start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    period_txns = await db.transactions.find(scoped_filter(user, {"date": {"$gte": start.isoformat()}}), {"_id": 0}).to_list(5000)

    # ── Monthly trend (last 6 calendar months) ───────────────────────────────
    six_ago = (now.replace(day=1) - timedelta(days=150)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    trend_txns = await db.transactions.find(scoped_filter(user, {"date": {"$gte": six_ago.isoformat()}}), {"_id": 0}).to_list(10000)
    monthly: dict = {}
    for t in trend_txns:
        try:
            raw = t.get("date", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            key = dt.strftime("%b %Y")
            sort_key = dt.strftime("%Y%m")
            if key not in monthly: monthly[key] = {"month": key, "credit": 0.0, "debit": 0.0, "sort": sort_key}
            amt = float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
            monthly[key][t["type"]] += amt
        except: pass
    trend = sorted(monthly.values(), key=lambda x: x["sort"])[-6:]
    for m in trend: del m["sort"]

    # ── Payment method breakdown ──────────────────────────────────────────────
    pay_map: dict = {}
    for t in period_txns:
        pm = (t.get("payment_method") or "Other").strip()
        if pm not in pay_map: pay_map[pm] = {"method": pm, "total": 0.0, "count": 0}
        amt = float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
        pay_map[pm]["total"] = round(pay_map[pm]["total"] + amt, 2)
        pay_map[pm]["count"] += 1
    payment_methods = sorted(pay_map.values(), key=lambda x: -x["total"])

    # ── Credit sales tracker ──────────────────────────────────────────────────
    credit_on_credit = [t for t in period_txns if t.get("on_credit") and t.get("type") == "credit"]
    total_on_credit = sum(float(t.get("amount") or 0) for t in credit_on_credit)
    total_collected = sum(float(t.get("amount_paid") or 0) for t in credit_on_credit)

    # ── Devices in period ─────────────────────────────────────────────────────
    devices = await db.devices.find(
        scoped_filter(user, {"created_at": {"$gte": start.isoformat()}}),
        {"_id": 0, "status": 1, "repair_status": 1, "inward_date": 1, "outward_date": 1,
         "issue_categories": 1, "created_at": 1, "brand": 1}
    ).to_list(2000)
    dev_received = len(devices)
    dev_completed = len([d for d in devices if d.get("repair_status") in ("completed", "delivered")])
    dev_delivered = len([d for d in devices if d.get("status") == "issued" or d.get("repair_status") == "delivered"])
    dev_pending = len([d for d in devices if d.get("status") == "in_repair" and d.get("repair_status") not in ("completed", "delivered")])

    # ── Avg repair turnaround ─────────────────────────────────────────────────
    turnarounds = []
    for d in devices:
        try:
            if not d.get("outward_date") or not d.get("inward_date"): continue
            inw_raw, outw_raw = d["inward_date"], d["outward_date"]
            inw = datetime.fromisoformat(inw_raw.replace("Z", "+00:00") if inw_raw.endswith("Z") else inw_raw)
            outw = datetime.fromisoformat(outw_raw.replace("Z", "+00:00") if outw_raw.endswith("Z") else outw_raw)
            days = (outw - inw).days
            if 0 <= days <= 365: turnarounds.append(days)
        except: pass
    avg_turnaround = round(sum(turnarounds) / len(turnarounds), 1) if turnarounds else None

    # ── Top issue categories ──────────────────────────────────────────────────
    issue_map: dict = {}
    for d in devices:
        for issue in (d.get("issue_categories") or []):
            issue_map[issue] = issue_map.get(issue, 0) + 1
    top_issues = [{"issue": k, "count": v} for k, v in sorted(issue_map.items(), key=lambda x: -x[1])[:10]]

    # ── Busiest days of week ──────────────────────────────────────────────────
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    day_map = {d: {"day": d, "transactions": 0, "amount": 0.0} for d in day_names}
    for t in period_txns:
        try:
            raw = t.get("date", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            day = day_names[dt.weekday()]
            day_map[day]["transactions"] += 1
            if t.get("type") == "credit":
                amt = float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
                day_map[day]["amount"] = round(day_map[day]["amount"] + amt, 2)
        except: pass

    # ── Outstanding balances ──────────────────────────────────────────────────
    custs = await db.customers.find(scoped_filter(user), {"_id": 0, "name": 1, "phone": 1, "balance": 1}).to_list(10000)
    to_receive = sorted([{"name": c["name"], "phone": c.get("phone"), "amount": round(float(c.get("balance") or 0), 2)} for c in custs if (c.get("balance") or 0) > 0], key=lambda x: -x["amount"])
    to_pay = sorted([{"name": c["name"], "phone": c.get("phone"), "amount": round(abs(float(c.get("balance") or 0)), 2)} for c in custs if (c.get("balance") or 0) < 0], key=lambda x: -x["amount"])

    # ── Top customers by revenue (period) ────────────────────────────────────
    cust_revenue: dict = {}
    for t in period_txns:
        if not t.get("customer_id"): continue
        cid = t["customer_id"]
        if cid not in cust_revenue: cust_revenue[cid] = {"customer_id": cid, "amount": 0.0, "transactions": 0}
        if t.get("type") == "credit":
            amt = float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
            cust_revenue[cid]["amount"] = round(cust_revenue[cid]["amount"] + amt, 2)
            cust_revenue[cid]["transactions"] += 1
    if cust_revenue:
        cust_docs = await db.customers.find(
            scoped_filter(user, {"id": {"$in": list(cust_revenue.keys())}}),
            {"_id": 0, "id": 1, "name": 1, "phone": 1}
        ).to_list(200)
        cust_by_id = {c["id"]: c for c in cust_docs}
        top_customers = sorted([
            {"name": cust_by_id.get(k, {}).get("name", "Unknown"), "phone": cust_by_id.get(k, {}).get("phone"),
             "amount": v["amount"], "transactions": v["transactions"]}
            for k, v in cust_revenue.items() if k in cust_by_id and v["amount"] > 0
        ], key=lambda x: -x["amount"])[:10]
    else:
        top_customers = []

    # ── Cash flow calendar (last 90 days credit) ──────────────────────────────
    ninety_ago = now - timedelta(days=89)
    cal_txns = await db.transactions.find(
        scoped_filter(user, {"date": {"$gte": ninety_ago.isoformat()}, "type": "credit"}),
        {"_id": 0, "date": 1, "amount": 1, "amount_paid": 1, "on_credit": 1}
    ).to_list(5000)
    cal_map: dict = {}
    for t in cal_txns:
        try:
            raw = t.get("date", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            day = dt.strftime("%Y-%m-%d")
            amt = float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
            cal_map[day] = round(cal_map.get(day, 0) + amt, 2)
        except: pass
    cash_flow_calendar = [{"date": k, "amount": v} for k, v in sorted(cal_map.items())]

    # ── Brand popularity (period devices) ────────────────────────────────────
    brand_map: dict = {}
    for d in devices:
        b = (d.get("brand") or "Unknown").strip()
        brand_map[b] = brand_map.get(b, 0) + 1
    brand_popularity = sorted([{"brand": k, "count": v} for k, v in brand_map.items()], key=lambda x: -x["count"])[:10]

    # ── Daily inward calendar (last 90 days) ──────────────────────────────────
    ninety_ago_inward = now - timedelta(days=89)
    inward_90 = await db.devices.find(
        scoped_filter(user, {"created_at": {"$gte": ninety_ago_inward.isoformat()}}),
        {"_id": 0, "inward_date": 1, "created_at": 1}
    ).to_list(2000)
    inward_cal: dict = {}
    for d in inward_90:
        try:
            raw = d.get("inward_date") or d.get("created_at", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            day = dt.strftime("%Y-%m-%d")
            inward_cal[day] = inward_cal.get(day, 0) + 1
        except: pass
    daily_inward_calendar = [{"date": k, "count": v} for k, v in sorted(inward_cal.items())]

    # ── Daily outstanding calendar (last 90 days on_credit debits) ────────────
    outstanding_90 = await db.transactions.find(
        scoped_filter(user, {"date": {"$gte": ninety_ago_inward.isoformat()}, "type": "debit", "on_credit": True}),
        {"_id": 0, "date": 1, "amount": 1, "amount_paid": 1}
    ).to_list(5000)
    outstanding_cal: dict = {}
    for t in outstanding_90:
        try:
            raw = t.get("date", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            day = dt.strftime("%Y-%m-%d")
            remaining = max(0, float(t.get("amount") or 0) - float(t.get("amount_paid") or 0))
            outstanding_cal[day] = round(outstanding_cal.get(day, 0) + remaining, 2)
        except: pass
    daily_outstanding_calendar = [{"date": k, "amount": v} for k, v in sorted(outstanding_cal.items())]

    # ── Daily outward calendar (last 90 days issued devices) ─────────────────
    outward_90 = await db.devices.find(
        scoped_filter(user, {"outward_date": {"$gte": ninety_ago_inward.isoformat()}}),
        {"_id": 0, "outward_date": 1}
    ).to_list(2000)
    outward_cal: dict = {}
    for d in outward_90:
        try:
            raw = d.get("outward_date", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            day = dt.strftime("%Y-%m-%d")
            outward_cal[day] = outward_cal.get(day, 0) + 1
        except: pass
    daily_outward_calendar = [{"date": k, "count": v} for k, v in sorted(outward_cal.items())]

    # ── Repeat customers ──────────────────────────────────────────────────────
    all_dev_phones = await db.devices.find(scoped_filter(user), {"_id": 0, "customer_phone": 1, "customer_name": 1}).to_list(10000)
    phone_map: dict = {}
    for d in all_dev_phones:
        key = (d.get("customer_phone") or "").strip() or (d.get("customer_name") or "Unknown")
        if key not in phone_map:
            phone_map[key] = {"name": d.get("customer_name", "Unknown"), "phone": d.get("customer_phone"), "visits": 0}
        phone_map[key]["visits"] += 1
    repeat_list = sorted([v for v in phone_map.values() if v["visits"] > 1], key=lambda x: -x["visits"])[:10]
    repeat_customers = {
        "total_unique": len(phone_map),
        "repeat_count": len([v for v in phone_map.values() if v["visits"] > 1]),
        "top_repeat": repeat_list,
    }

    # ── Pending delivery (repair done, not picked up) ─────────────────────────
    pending_del = await db.devices.find(
        scoped_filter(user, {"status": "in_repair", "repair_status": "completed"}),
        {"_id": 0, "brand": 1, "model": 1, "job_number": 1, "device_id": 1,
         "customer_name": 1, "customer_phone": 1, "inward_date": 1, "created_at": 1}
    ).to_list(100)
    for d in pending_del:
        try:
            raw = d.get("inward_date") or d.get("created_at", "")
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00") if raw.endswith("Z") else raw)
            d["days_waiting"] = (now - dt).days
        except: d["days_waiting"] = 0

    return {
        "monthly_trend": trend,
        "payment_methods": payment_methods,
        "credit_sales": {
            "total_on_credit": round(total_on_credit, 2),
            "total_collected": round(total_collected, 2),
            "total_pending": round(total_on_credit - total_collected, 2),
        },
        "devices": {
            "received": dev_received, "completed": dev_completed,
            "delivered": dev_delivered, "pending": dev_pending,
            "avg_turnaround_days": avg_turnaround,
        },
        "top_issues": top_issues,
        "busiest_days": list(day_map.values()),
        "outstanding": {
            "to_receive": to_receive[:10], "to_pay": to_pay[:10],
            "total_receive": round(sum(x["amount"] for x in to_receive), 2),
            "total_pay": round(sum(x["amount"] for x in to_pay), 2),
        },
        "top_customers": top_customers,
        "cash_flow_calendar": cash_flow_calendar,
        "daily_inward_calendar": daily_inward_calendar,
        "daily_outstanding_calendar": daily_outstanding_calendar,
        "daily_outward_calendar": daily_outward_calendar,
        "brand_popularity": brand_popularity,
        "repeat_customers": repeat_customers,
        "pending_delivery": pending_del,
    }

# ── Combined Dashboard ────────────────────────────────────────────────────────
@api_router.get("/ledger/dashboard")
async def ledger_dashboard(user: dict = Depends(get_current_user)):
    txns = await db.transactions.find(scoped_filter(user), {"_id": 0}).to_list(50000)
    total_credit = sum(
        float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
        for t in txns if t.get("type") == "credit"
    )
    total_debit = sum(
        float(t.get("amount_paid") or 0) if t.get("on_credit") else float(t.get("amount") or 0)
        for t in txns if t.get("type") == "debit"
    )
    recent = await db.transactions.find(scoped_filter(user), {"_id": 0}).sort("date", -1).to_list(8)
    customer_count = await db.customers.count_documents(scoped_filter(user))
    return {"total_credit": round(total_credit, 2),
            "total_debit": round(total_debit, 2),
            "net_balance": round(total_credit - total_debit, 2),
            "customer_count": customer_count, "recent_transactions": recent}

@api_router.get("/ledger/daily-cash")
async def ledger_daily_cash(
    start_date: str,
    end_date: str,
    user: dict = Depends(get_current_user),
):
    txns = await db.transactions.find(scoped_filter(user), {"_id": 0}).to_list(50000)
    credit = sum(txn_cash_on_day(t, start_date, end_date, "credit") for t in txns)
    debit = sum(txn_cash_on_day(t, start_date, end_date, "debit") for t in txns)
    return {"credit": round(credit, 2), "debit": round(debit, 2)}

# ── Catalog: Default Data ─────────────────────────────────────────────────────
DEFAULT_BRANDS = [
    {"name": "Apple", "models": [
        "MacBook Air (2015) Intel", "MacBook Air (2017) Intel",
        "MacBook Air (2018) Intel", "MacBook Air (2019) Intel", "MacBook Air (2020) Intel",
        "MacBook Air M1 (2020)", "MacBook Air M2 (2022)",
        "MacBook Air 13\" M3 (2024)", "MacBook Air 15\" M3 (2024)",
        "MacBook Air 13\" M4 (2025)", "MacBook Air 15\" M4 (2025)",
        "MacBook Pro 13\" (2015) Intel", "MacBook Pro 15\" (2015) Intel",
        "MacBook Pro 13\" (2016) Intel", "MacBook Pro 15\" (2016) Intel",
        "MacBook Pro 13\" (2017) Intel", "MacBook Pro 15\" (2017) Intel",
        "MacBook Pro 13\" (2018) Intel", "MacBook Pro 15\" (2018) Intel",
        "MacBook Pro 13\" (2019) Intel", "MacBook Pro 15\" (2019) Intel",
        "MacBook Pro 13\" (2020) Intel", "MacBook Pro 16\" (2019) Intel", "MacBook Pro 16\" (2020) Intel",
        "MacBook Pro 13\" M1 (2020)", "MacBook Pro 14\" M1 Pro (2021)", "MacBook Pro 16\" M1 Pro (2021)",
        "MacBook Pro 14\" M1 Max (2021)", "MacBook Pro 16\" M1 Max (2021)",
        "MacBook Pro 13\" M2 (2022)", "MacBook Pro 14\" M2 Pro (2023)", "MacBook Pro 16\" M2 Pro (2023)",
        "MacBook Pro 14\" M2 Max (2023)", "MacBook Pro 16\" M2 Max (2023)",
        "MacBook Pro 14\" M3 (2024)", "MacBook Pro 14\" M3 Pro (2024)", "MacBook Pro 16\" M3 Pro (2024)",
        "MacBook Pro 14\" M3 Max (2024)", "MacBook Pro 16\" M3 Max (2024)",
        "MacBook Pro 14\" M4 (2024)", "MacBook Pro 16\" M4 (2024)",
        "MacBook Pro 14\" M4 Pro (2025)", "MacBook Pro 16\" M4 Pro (2025)",
        "iMac 21.5\" (2019) Intel", "iMac 24\" M1 (2021)", "iMac 24\" M3 (2023)", "iMac 24\" M4 (2024)",
        "Mac mini M1 (2020)", "Mac mini M2 (2023)", "Mac mini M4 (2024)",
        "Other",
    ]},
    {"name": "Dell", "models": [
        "XPS 13 9350 (2016)", "XPS 13 9360 (2017)", "XPS 13 9370 (2018)", "XPS 13 9380 (2019)",
        "XPS 13 9300 (2020)", "XPS 13 9310 (2021)", "XPS 13 Plus 9320 (2022)",
        "XPS 13 9340 (2024)", "XPS 14 9440 (2024)",
        "XPS 15 9550 (2016)", "XPS 15 9560 (2017)", "XPS 15 9570 (2018)", "XPS 15 9500 (2020)",
        "XPS 15 9510 (2021)", "XPS 15 9520 (2022)", "XPS 15 9530 (2023)", "XPS 15 9540 (2024)",
        "XPS 17 9700 (2020)", "XPS 17 9710 (2021)", "XPS 17 9720 (2022)", "XPS 17 9730 (2023)",
        "Inspiron 14 3000", "Inspiron 14 5000", "Inspiron 14 7000",
        "Inspiron 15 3000", "Inspiron 15 5000", "Inspiron 15 7000", "Inspiron 16 Plus",
        "Latitude 5400", "Latitude 5410", "Latitude 5420", "Latitude 5430", "Latitude 5440",
        "Latitude 7400", "Latitude 7420", "Latitude 7430", "Latitude 7440",
        "Latitude 9510", "Latitude 9520",
        "G15 Gaming", "G16 Gaming", "G3 15", "G5 15",
        "Precision 3560", "Precision 5560", "Precision 5570",
        "Vostro 14 3000", "Vostro 15 3000", "Vostro 15 5000",
        "Other",
    ]},
    {"name": "HP", "models": [
        "Spectre x360 13 (2016)", "Spectre x360 13 (2018)", "Spectre x360 13 (2020)",
        "Spectre x360 14 (2021)", "Spectre x360 14 (2023)", "Spectre x360 16 (2022)",
        "Spectre x360 16 (2024)",
        "Envy 13 (2017)", "Envy 13 (2019)", "Envy 13 (2021)",
        "Envy 15 (2020)", "Envy 15 (2022)", "Envy 17 (2021)", "Envy 17 (2023)",
        "Envy x360 13 (2020)", "Envy x360 15 (2020)", "Envy x360 15 (2022)",
        "Pavilion 14 (2021)", "Pavilion 15 (2021)", "Pavilion 15 (2023)", "Pavilion 16 (2024)",
        "Pavilion x360 14", "Pavilion x360 15",
        "EliteBook 840 G5", "EliteBook 840 G7", "EliteBook 840 G8", "EliteBook 840 G9", "EliteBook 840 G10",
        "EliteBook 850 G8", "EliteBook 1040 G9", "EliteBook 1040 G10",
        "ProBook 440 G7", "ProBook 440 G8", "ProBook 450 G8", "ProBook 450 G9", "ProBook 455 G9",
        "Omen 15 (2020)", "Omen 16 (2021)", "Omen 16 (2023)", "Omen 17 (2022)",
        "HP Laptop 14s", "HP Laptop 15s", "HP 250 G8", "HP 250 G9",
        "Other",
    ]},
    {"name": "Lenovo", "models": [
        "ThinkPad X1 Carbon Gen 3 (2015)", "ThinkPad X1 Carbon Gen 4 (2016)",
        "ThinkPad X1 Carbon Gen 5 (2017)", "ThinkPad X1 Carbon Gen 6 (2018)",
        "ThinkPad X1 Carbon Gen 7 (2019)", "ThinkPad X1 Carbon Gen 8 (2020)",
        "ThinkPad X1 Carbon Gen 9 (2021)", "ThinkPad X1 Carbon Gen 10 (2022)",
        "ThinkPad X1 Carbon Gen 11 (2023)", "ThinkPad X1 Carbon Gen 12 (2024)",
        "ThinkPad T470", "ThinkPad T480", "ThinkPad T490",
        "ThinkPad T14 Gen 1", "ThinkPad T14 Gen 2", "ThinkPad T14 Gen 3", "ThinkPad T14 Gen 4",
        "ThinkPad E14 Gen 2", "ThinkPad E14 Gen 3", "ThinkPad E14 Gen 4", "ThinkPad E14 Gen 5",
        "ThinkPad E15 Gen 2", "ThinkPad E15 Gen 3", "ThinkPad E16 Gen 1",
        "ThinkPad L14 Gen 3", "ThinkPad L15 Gen 3",
        "IdeaPad 3 14", "IdeaPad 3 15", "IdeaPad 5 14", "IdeaPad 5 15",
        "IdeaPad Slim 3", "IdeaPad Slim 5", "IdeaPad Slim 7",
        "IdeaPad Gaming 3", "IdeaPad Gaming 3i",
        "Legion 5 Gen 6", "Legion 5 Gen 7", "Legion 5 Gen 8", "Legion 5 Gen 9",
        "Legion 5 Pro Gen 6", "Legion 5 Pro Gen 7", "Legion 7 Gen 7", "Legion Slim 5 Gen 8",
        "Yoga 7 14", "Yoga 7 16", "Yoga 9 14", "Yoga 9 15",
        "Yoga Slim 7 14", "Yoga Slim 7 Pro 14",
        "V14 Gen 2", "V15 Gen 2", "V14 Gen 3", "V15 Gen 3",
        "Other",
    ]},
    {"name": "Asus", "models": [
        "VivoBook 14 (2019)", "VivoBook 14 (2021)", "VivoBook 15 (2020)", "VivoBook 15 (2022)",
        "VivoBook 15X", "VivoBook 16", "VivoBook S14 OLED", "VivoBook S15 OLED", "VivoBook S 15 (2024)",
        "VivoBook Pro 14 OLED", "VivoBook Pro 15 OLED",
        "ZenBook 13 UX333 (2019)", "ZenBook 13 UX325 (2021)",
        "ZenBook 14 UX433 (2019)", "ZenBook 14 UX425 (2021)",
        "ZenBook 14 OLED (2022)", "ZenBook 14X OLED (2022)", "ZenBook 15 UX534 (2019)",
        "ROG Strix G15 (2021)", "ROG Strix G15 (2023)", "ROG Strix G17 (2021)",
        "ROG Strix SCAR 15", "ROG Strix SCAR 17",
        "ROG Zephyrus G14 (2020)", "ROG Zephyrus G14 (2022)", "ROG Zephyrus G14 (2024)",
        "ROG Zephyrus G15 (2021)", "ROG Zephyrus M16",
        "TUF Gaming A15 (2020)", "TUF Gaming A15 (2022)", "TUF Gaming A15 (2024)",
        "TUF Gaming F15 (2021)", "TUF Gaming F15 (2023)",
        "TUF Gaming F17 (2021)", "TUF Gaming F17 (2023)",
        "ExpertBook B1 B1500", "ExpertBook B9 B9450",
        "Other",
    ]},
    {"name": "Acer", "models": [
        "Aspire 3 A315 (2018)", "Aspire 3 A315 (2021)", "Aspire 3 A315 (2023)",
        "Aspire 5 A515 (2018)", "Aspire 5 A515 (2020)", "Aspire 5 A515 (2022)", "Aspire 5 A515 (2024)",
        "Aspire 7 A715 (2021)", "Aspire 7 A715 (2023)", "Aspire Lite 14", "Aspire Lite 15",
        "Swift 3 SF314 (2017)", "Swift 3 SF314 (2019)", "Swift 3 SF314 (2021)",
        "Swift 5 SF514 (2018)", "Swift 5 SF514 (2020)",
        "Swift X 14 SFX14 (2021)", "Swift X 14 SFX14 (2023)", "Swift X 16 (2022)",
        "Swift Go 14 (2023)", "Swift Go 16 (2023)",
        "Nitro 5 AN515 (2019)", "Nitro 5 AN515 (2021)", "Nitro 5 AN515 (2023)",
        "Nitro V 15 (2024)", "Nitro V 16 (2024)",
        "Predator Helios 300 PH315 (2018)", "Predator Helios 300 PH315 (2020)",
        "Predator Helios 300 PH315 (2022)", "Predator Helios Neo 16 (2023)",
        "Predator Triton 500 (2019)", "Predator Triton 500 SE (2021)",
        "Extensa 15 EX215", "TravelMate P2 TMP215", "TravelMate P4 TMP414",
        "Other",
    ]},
    {"name": "MSI", "models": [
        "GS63 Stealth (2016)", "GS65 Stealth (2018)", "GS66 Stealth (2020)", "GS76 Stealth (2021)",
        "GT76 Titan (2019)", "GT76 Titan (2020)",
        "GP65 Leopard (2019)", "GP66 Leopard (2021)", "GP76 Leopard (2021)",
        "GF63 Thin (2019)", "GF63 Thin (2021)", "GF63 Thin (2023)",
        "Raider GE66 (2021)", "Raider GE76 (2021)", "Raider GE67 HX (2023)",
        "Vector GP66 (2022)", "Vector GP76 (2022)",
        "Katana GF66 (2021)", "Katana 15 B12 (2022)",
        "Sword 15 (2022)", "Pulse GL66 (2021)", "Pulse 15 B13 (2023)",
        "Stealth 15M (2021)", "Stealth 14 Studio (2023)",
        "Modern 14 (2020)", "Modern 14 (2022)", "Modern 15 (2021)", "Modern 15 (2023)",
        "Prestige 14 (2020)", "Prestige 14 (2022)", "Prestige 15 (2021)",
        "Creator M16 (2022)", "Summit E16 Flip (2021)",
        "Other",
    ]},
    {"name": "Microsoft Surface", "models": [
        "Surface Pro 4 (2015)", "Surface Pro (2017)", "Surface Pro 6 (2018)",
        "Surface Pro 7 (2019)", "Surface Pro 7+ (2021)", "Surface Pro 8 (2021)",
        "Surface Pro 9 (2022)", "Surface Pro 10 (2024)", "Surface Pro 11 (2024)",
        "Surface Laptop 1 (2017)", "Surface Laptop 2 (2018)", "Surface Laptop 3 (2019)",
        "Surface Laptop 4 (2021)", "Surface Laptop 5 (2022)", "Surface Laptop 6 (2024)",
        "Surface Laptop 7 (2024)",
        "Surface Laptop Go (2020)", "Surface Laptop Go 2 (2022)", "Surface Laptop Go 3 (2023)",
        "Surface Laptop Studio (2021)", "Surface Laptop Studio 2 (2023)",
        "Surface Book (2015)", "Surface Book 2 (2017)", "Surface Book 3 (2020)",
        "Other",
    ]},
    {"name": "Samsung", "models": [
        "Galaxy Book Pro 13 (2021)", "Galaxy Book Pro 15 (2021)", "Galaxy Book Pro 360 15 (2021)",
        "Galaxy Book 2 (2022)", "Galaxy Book 2 Pro 13 (2022)", "Galaxy Book 2 Pro 15 (2022)",
        "Galaxy Book 2 Pro 360 13 (2022)", "Galaxy Book 2 Business (2022)",
        "Galaxy Book 3 (2023)", "Galaxy Book 3 Pro 14 (2023)", "Galaxy Book 3 Pro 16 (2023)",
        "Galaxy Book 3 Ultra (2023)", "Galaxy Book 3 360 (2023)",
        "Galaxy Book 4 (2024)", "Galaxy Book 4 Pro 14 (2024)", "Galaxy Book 4 Pro 16 (2024)",
        "Galaxy Book 4 Ultra (2024)", "Galaxy Book 4 360 (2024)",
        "Galaxy Book 5 Pro 14 (2025)", "Galaxy Book 5 Pro 16 (2025)",
        "Notebook 9 Pro (2018)", "Notebook 9 (2019)",
        "Other",
    ]},
    {"name": "Razer", "models": [
        "Razer Blade Stealth 13 (2017)", "Razer Blade Stealth 13 (2019)", "Razer Blade Stealth 13 (2021)",
        "Razer Blade 15 Base (2018)", "Razer Blade 15 Base (2019)", "Razer Blade 15 Base (2020)",
        "Razer Blade 15 Base (2021)", "Razer Blade 15 (2022)", "Razer Blade 15 (2023)", "Razer Blade 15 (2024)",
        "Razer Blade 15 Advanced (2018)", "Razer Blade 15 Advanced (2019)",
        "Razer Blade 15 Advanced (2020)", "Razer Blade 15 Advanced (2021)",
        "Razer Blade 17 Pro (2018)", "Razer Blade 17 Pro (2019)", "Razer Blade 17 (2021)",
        "Razer Blade 17 (2022)", "Razer Blade 17 (2023)",
        "Razer Blade 14 (2021)", "Razer Blade 14 (2022)", "Razer Blade 14 (2023)", "Razer Blade 14 (2024)",
        "Razer Blade 16 (2023)", "Razer Blade 16 (2024)",
        "Other",
    ]},
    {"name": "LG", "models": [
        "LG Gram 13 (2016)", "LG Gram 14 (2017)", "LG Gram 15 (2017)",
        "LG Gram 14 (2018)", "LG Gram 15 (2018)",
        "LG Gram 14 (2019)", "LG Gram 15 (2019)", "LG Gram 17 (2019)",
        "LG Gram 14 (2020)", "LG Gram 15 (2020)", "LG Gram 17 (2020)",
        "LG Gram 14 (2021)", "LG Gram 16 (2021)", "LG Gram 17 (2021)", "LG Gram 360 14 (2021)",
        "LG Gram 14 (2022)", "LG Gram 16 (2022)", "LG Gram 17 (2022)", "LG Gram 360 16 (2022)",
        "LG Gram 14 (2023)", "LG Gram 16 (2023)", "LG Gram 17 (2023)",
        "LG Gram Style 14 (2023)", "LG Gram Style 16 (2023)",
        "LG Gram 14 (2024)", "LG Gram 16 (2024)", "LG Gram Pro 16 (2024)", "LG Gram Pro 17 (2024)",
        "Other",
    ]},
    {"name": "Toshiba / Dynabook", "models": [
        "Satellite C55 (2015)", "Satellite C75 (2015)", "Satellite Pro L50 (2016)",
        "Satellite Pro C50 (2017)", "Satellite Pro R50 (2018)",
        "Tecra A50 (2016)", "Tecra A50 (2018)", "Tecra A50 (2020)",
        "Tecra X40 (2017)", "Tecra X40 (2019)",
        "Portege Z30 (2016)", "Portege Z30 (2018)", "Portege X30L (2019)",
        "Portege X30L (2021)", "Portege X40 (2022)",
        "Dynabook Satellite Pro L50 (2020)", "Dynabook Tecra A50 (2021)",
        "Dynabook Portege X30L (2021)", "Dynabook Portege X40 (2022)",
        "Other",
    ]},
    {"name": "Sony VAIO", "models": [
        "VAIO S Series", "VAIO SX12", "VAIO SX14", "VAIO FE14", "VAIO FE15",
        "VAIO Z (2021)", "VAIO F16 (2023)", "VAIO F14 (2023)",
        "Other",
    ]},
    {"name": "Other", "models": ["Other"]},
]

DEFAULT_BANKS = ["Cash", "HDFC Bank", "Yes Bank", "SBI"]

DEFAULT_ISSUE_CATEGORIES = [
    "Hinge Repair", "Formatting / OS Installation", "Antivirus / Virus Removal",
    "Full Body Change", "Screen Repair / Replacement", "Battery Replacement",
    "Keyboard Repair", "Charging Port Repair", "RAM Upgrade",
    "SSD / HDD Replacement", "Motherboard Repair", "Overheating / Fan Cleaning",
    "Data Recovery", "Speaker Repair", "Trackpad Repair",
    "Power Button Repair", "USB Port Repair", "Display Cable Replacement",
    "BIOS Password Removal", "Liquid Damage Repair", "Network / WiFi Repair",
    "Software Installation",     "Other",
]

async def _seed_shop_catalog(shop_id: str):
    if await db.brands.count_documents({"shop_id": shop_id}) == 0:
        await db.brands.insert_many([
            {"brand_id": str(uuid.uuid4()), "shop_id": shop_id, "name": b["name"], "models": b["models"]}
            for b in DEFAULT_BRANDS
        ])
    if await db.issue_categories.count_documents({"shop_id": shop_id}) == 0:
        await db.issue_categories.insert_many([
            {"category_id": str(uuid.uuid4()), "shop_id": shop_id, "name": n} for n in DEFAULT_ISSUE_CATEGORIES
        ])
    if await db.banks.count_documents({"shop_id": shop_id}) == 0:
        await db.banks.insert_many([
            {"bank_id": str(uuid.uuid4()), "shop_id": shop_id, "name": n} for n in DEFAULT_BANKS
        ])

# ── Catalog Routes ────────────────────────────────────────────────────────────
class BrandCreate(BaseModel):
    name: str

class ModelAdd(BaseModel):
    model_name: str

class IssueCategoryCreate(BaseModel):
    name: str
    default_cost: Optional[float] = None

@api_router.get("/catalog/brands")
async def get_brands(user: dict = Depends(get_current_user)):
    return await db.brands.find(scoped_filter(user), {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/catalog/brands")
async def add_brand(body: BrandCreate, user: dict = Depends(get_current_user)):
    if await db.brands.find_one(scoped_filter(user, {"name": body.name})):
        raise HTTPException(400, "Brand already exists")
    doc = {"brand_id": str(uuid.uuid4()), "name": body.name.strip(), "models": ["Other"]}
    await db.brands.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.delete("/catalog/brands/{brand_id}")
async def delete_brand(brand_id: str, user: dict = Depends(get_current_user)):
    r = await db.brands.delete_one(scoped_filter(user, {"brand_id": brand_id}))
    if r.deleted_count == 0: raise HTTPException(404, "Brand not found")
    return {"ok": True}

@api_router.post("/catalog/brands/{brand_id}/models")
async def add_model_to_brand(brand_id: str, body: ModelAdd, user: dict = Depends(get_current_user)):
    r = await db.brands.update_one(scoped_filter(user, {"brand_id": brand_id}), {"$addToSet": {"models": body.model_name.strip()}})
    if r.matched_count == 0: raise HTTPException(404, "Brand not found")
    return {"ok": True}

@api_router.delete("/catalog/brands/{brand_id}/models/{model_name:path}")
async def delete_model_from_brand(brand_id: str, model_name: str, user: dict = Depends(get_current_user)):
    r = await db.brands.update_one(scoped_filter(user, {"brand_id": brand_id}), {"$pull": {"models": model_name}})
    if r.matched_count == 0: raise HTTPException(404, "Brand not found")
    return {"ok": True}

@api_router.get("/catalog/issue-categories")
async def get_issue_categories(user: dict = Depends(get_current_user)):
    return await db.issue_categories.find(scoped_filter(user), {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/catalog/issue-categories")
async def add_issue_category(body: IssueCategoryCreate, user: dict = Depends(get_current_user)):
    if await db.issue_categories.find_one(scoped_filter(user, {"name": body.name})):
        raise HTTPException(400, "Category already exists")
    doc = {"category_id": str(uuid.uuid4()), "name": body.name.strip(), "default_cost": body.default_cost}
    await db.issue_categories.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.put("/catalog/issue-categories/{category_id}")
async def update_issue_category(category_id: str, body: IssueCategoryCreate, user: dict = Depends(get_current_user)):
    r = await db.issue_categories.update_one(
        scoped_filter(user, {"category_id": category_id}),
        {"$set": {"name": body.name.strip(), "default_cost": body.default_cost}}
    )
    if r.matched_count == 0: raise HTTPException(404, "Category not found")
    return await db.issue_categories.find_one(scoped_filter(user, {"category_id": category_id}), {"_id": 0})

@api_router.delete("/catalog/issue-categories/{category_id}")
async def delete_issue_category(category_id: str, user: dict = Depends(get_current_user)):
    r = await db.issue_categories.delete_one(scoped_filter(user, {"category_id": category_id}))
    if r.deleted_count == 0: raise HTTPException(404, "Category not found")
    return {"ok": True}

@api_router.get("/customers/{customer_id}/last-device")
async def get_customer_last_device(customer_id: str, user: dict = Depends(get_current_user)):
    cust = await db.customers.find_one(scoped_filter(user, {"id": customer_id}), {"_id": 0, "phone": 1})
    if not cust or not cust.get("phone"): return None
    devices = await db.devices.find(
        scoped_filter(user, {"customer_phone": cust["phone"]}),
        {"_id": 0, "brand": 1, "model": 1, "device_type": 1, "job_number": 1}
    ).sort("created_at", -1).limit(1).to_list(1)
    return devices[0] if devices else None

class BankCreate(BaseModel):
    name: str

@api_router.get("/catalog/banks")
async def get_banks(user: dict = Depends(get_current_user)):
    return await db.banks.find(scoped_filter(user), {"_id": 0}).to_list(100)

@api_router.post("/catalog/banks")
async def add_bank(body: BankCreate, user: dict = Depends(get_current_user)):
    if await db.banks.find_one(scoped_filter(user, {"name": body.name})):
        raise HTTPException(400, "Bank already exists")
    doc = {"bank_id": str(uuid.uuid4()), "name": body.name.strip()}
    await db.banks.insert_one(with_shop(user, doc))
    doc.pop("_id", None)
    return doc

@api_router.put("/catalog/banks/{bank_id}")
async def update_bank(bank_id: str, body: dict, user: dict = Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    if not name: raise HTTPException(400, "Name is required")
    r = await db.banks.update_one(scoped_filter(user, {"bank_id": bank_id}), {"$set": {"name": name}})
    if r.matched_count == 0: raise HTTPException(404, "Bank not found")
    return await db.banks.find_one(scoped_filter(user, {"bank_id": bank_id}), {"_id": 0})

@api_router.delete("/catalog/banks/{bank_id}")
async def delete_bank(bank_id: str, user: dict = Depends(get_current_user)):
    r = await db.banks.delete_one(scoped_filter(user, {"bank_id": bank_id}))
    if r.deleted_count == 0: raise HTTPException(404, "Bank not found")
    return {"ok": True}

# ── Health ───────────────────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"message": "Krish Computer Store API", "version": "1.0.0"}

# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    await db.app_config.update_many(
        {"shop_id": {"$exists": False}},
        {"$set": {"shop_id": DEFAULT_SHOP_ID}},
    )
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("email", sparse=True)
    for collection in (
        db.users, db.devices, db.movements, db.customers, db.transactions,
        db.categories, db.reminders, db.brands, db.issue_categories, db.banks,
    ):
        await collection.update_many(
            {"shop_id": {"$exists": False}},
            {"$set": {"shop_id": DEFAULT_SHOP_ID}},
        )
    await db.devices.create_index("device_id", unique=True)
    # Unique serial per shop, but ONLY when a serial is actually provided.
    # A sparse compound index still indexes docs with serial_number=null (because
    # shop_id is present), so multiple blank-serial devices collided. A partial
    # index keyed on serial_number being a string fixes that.
    for stale in ("serial_number_1", "shop_id_1_serial_number_1"):
        try:
            await db.devices.drop_index(stale)
        except Exception:
            pass
    try:
        await db.devices.create_index(
            [("shop_id", 1), ("serial_number", 1)],
            unique=True,
            partialFilterExpression={"serial_number": {"$type": "string"}},
            name="shop_serial_unique",
        )
    except Exception:
        logger.exception("Could not create partial serial_number index")
    await db.movements.create_index("device_id")
    await db.transactions.create_index("customer_id")
    await db.transactions.create_index("date")
    await db.audit_logs.create_index([("shop_id", 1), ("created_at", -1)])
    # Migrate: copy credentials from app_config into the user document (old deployments)
    cfg = await db.app_config.find_one({"_id": APP_CONFIG_ID})
    if cfg:
        existing_user = await db.users.find_one({"user_id": SHOP_USER_ID}, {"_id": 0})
        if not existing_user:
            existing_user = await db.users.find_one(
                {"pin_hash": {"$exists": True, "$ne": None}}, {"_id": 0}
            )
        if existing_user:
            migration_fields: dict = {}
            if cfg.get("pin_hash") and not existing_user.get("pin_hash"):
                migration_fields["pin_hash"] = cfg["pin_hash"]
            if cfg.get("email_hash") and not existing_user.get("email_hash"):
                migration_fields["email_hash"] = cfg["email_hash"]
            if cfg.get("email") and not existing_user.get("email"):
                migration_fields["email"] = cfg["email"]
            if not existing_user.get("shop_id"):
                migration_fields["shop_id"] = cfg.get("shop_id") or DEFAULT_SHOP_ID
            if migration_fields:
                migration_fields.update({
                    "failed_login_attempts": 0,
                    "failed_pin_attempts": 0,
                    "locked_until": None,
                })
                logger.info("Migrating credentials from app_config → user document")
                await db.users.update_one(
                    {"user_id": existing_user["user_id"]},
                    {"$set": migration_fields},
                )

    # Seed catalog if empty
    if await db.brands.count_documents({"shop_id": DEFAULT_SHOP_ID}) == 0:
        await db.brands.insert_many([
            {"brand_id": str(uuid.uuid4()), "shop_id": DEFAULT_SHOP_ID, "name": b["name"], "models": b["models"]}
            for b in DEFAULT_BRANDS
        ])
    if await db.issue_categories.count_documents({"shop_id": DEFAULT_SHOP_ID}) == 0:
        await db.issue_categories.insert_many([
            {"category_id": str(uuid.uuid4()), "shop_id": DEFAULT_SHOP_ID, "name": n} for n in DEFAULT_ISSUE_CATEGORIES
        ])
    if await db.banks.count_documents({"shop_id": DEFAULT_SHOP_ID}) == 0:
        await db.banks.insert_many([
            {"bank_id": str(uuid.uuid4()), "shop_id": DEFAULT_SHOP_ID, "name": n} for n in DEFAULT_BANKS
        ])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

app.include_router(api_router)

@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
async def health():
    """Plain 200 OK — UptimeRobot uses HEAD by default; must not return 405."""
    return {"ok": True}

# ponytail: explicit origins required for credentials; '*' breaks withCredentials
def _build_cors_origins():
    explicit = os.environ.get('CORS_ORIGINS', '').strip()
    if explicit:
        return [o.strip().rstrip('/') for o in explicit.split(',') if o.strip()]
    origins = []
    for url in (
        FRONTEND_URL,
        'http://localhost:3000',
        'https://lapy-track.vercel.app',
        'https://frontend-kforkreativein-4819s-projects.vercel.app',
        'https://crm.krishcomputer.com',
    ):
        if url:
            clean = url.rstrip('/')
            if clean not in origins:
                origins.append(clean)
    return origins

# Catch unhandled errors INSIDE the CORS layer so the 500 response still carries
# CORS headers — otherwise the browser reports a generic "network error" and the
# real cause is hidden. Registered before CORS so CORS stays the outermost layer.
@app.middleware("http")
async def catch_unhandled_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Unhandled error: %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Server error. Please try again."})

cors_origins = _build_cors_origins()
app.add_middleware(CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"])
