"""
Krish Computer Life Services — Combined Store Management API
Merges: INward-Outward (device ledger) + DayBook-Tracker (financial ledger)
Auth: single 4-digit PIN, bcrypt, JWT cookie (7 days)
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os, uuid, logging, io, csv, hashlib, re
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
import qrcode
import qrcode.image.svg
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query
from fastapi.responses import StreamingResponse, Response as FastAPIResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# ── Config ──────────────────────────────────────────────────────────────────
MONGO_URL = os.environ.get('MONGO_URL') or os.environ.get('MONGODB_URI')
if not MONGO_URL:
    raise RuntimeError("Set MONGO_URL or MONGODB_URI to your MongoDB Atlas connection string.")
DB_NAME = os.environ.get('DB_NAME', 'krish_computer_db')
JWT_SECRET = os.environ.get('JWT_SECRET', 'krish-computer-secret-change-me')
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="Krish Computer Store API")
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

def set_auth_cookie(response: Response, token: str):
    # secure=False + samesite=lax works on http://localhost
    response.set_cookie("access_token", token, httponly=True, secure=False,
                        samesite="lax", max_age=7*24*3600, path="/")

async def get_app_config():
    return await db.app_config.find_one({"_id": APP_CONFIG_ID})

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
    return user

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

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

# ── Auth Routes ──────────────────────────────────────────────────────────────
@api_router.get("/auth/setup-status")
async def setup_status():
    cfg = await get_app_config()
    return {
        "needs_setup": cfg is None,
        "shop_name": cfg.get("shop_name") if cfg else None,
        "has_email": bool(cfg.get("email_hash")) if cfg else False,
    }

@api_router.post("/auth/setup")
async def setup_pin(payload: PinSetupIn, response: Response):
    if not payload.pin.isdigit() or len(payload.pin) != 4:
        raise HTTPException(400, "PIN must be exactly 4 digits")
    if not payload.shop_name.strip():
        raise HTTPException(400, "Shop name is required")
    if await get_app_config():
        raise HTTPException(400, "App already set up")
    t = now_iso()
    doc = {
        "_id": APP_CONFIG_ID,
        "shop_name": payload.shop_name.strip(),
        "pin_hash": hash_password(payload.pin),
        "created_at": t,
    }
    if payload.email and payload.password:
        doc["email"] = payload.email.strip().lower()
        doc["email_hash"] = hash_password(payload.password)
    await db.app_config.insert_one(doc)
    user = {"user_id": SHOP_USER_ID, "name": payload.shop_name.strip(), "role": "admin", "created_at": t}
    await db.users.update_one({"user_id": SHOP_USER_ID}, {"$set": user}, upsert=True)
    token = create_token(SHOP_USER_ID, payload.shop_name.strip())
    set_auth_cookie(response, token)
    return {"user": user, "access_token": token}

@api_router.post("/auth/login-email")
async def login_email(payload: EmailLoginIn, response: Response):
    """One-time full login with email + password → returns JWT. Used when cookie is missing."""
    cfg = await get_app_config()
    if not cfg: raise HTTPException(404, "App not set up yet")
    if not cfg.get("email") or not cfg.get("email_hash"):
        raise HTTPException(400, "Email login not configured for this account")
    if cfg["email"] != payload.email.strip().lower():
        raise HTTPException(401, "Incorrect email or password")
    if not verify_password(payload.password, cfg["email_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    user = await db.users.find_one({"user_id": SHOP_USER_ID}, {"_id": 0})
    if not user:
        user = {"user_id": SHOP_USER_ID, "name": cfg.get("shop_name", "Shop"), "role": "admin"}
    token = create_token(SHOP_USER_ID, user.get("name", ""))
    set_auth_cookie(response, token)
    return {"user": user, "access_token": token}

@api_router.post("/auth/login")
async def login_pin(payload: PinLoginIn, response: Response):
    if not payload.pin.isdigit() or len(payload.pin) != 4:
        raise HTTPException(400, "Invalid PIN")
    cfg = await get_app_config()
    if not cfg:
        raise HTTPException(404, "App not set up yet")
    if not verify_password(payload.pin, cfg["pin_hash"]):
        raise HTTPException(401, "Incorrect PIN")
    user = await db.users.find_one({"user_id": SHOP_USER_ID}, {"_id": 0})
    if not user:
        user = {"user_id": SHOP_USER_ID, "name": cfg.get("shop_name", "Shop"), "role": "admin"}
        await db.users.insert_one({**user, "created_at": now_iso()})
    token = create_token(SHOP_USER_ID, user.get("name", ""))
    set_auth_cookie(response, token)
    return {"user": user, "access_token": token}

@api_router.post("/auth/change-pin")
async def change_pin(payload: PinChangeIn, user: dict = Depends(get_current_user)):
    if not payload.new_pin.isdigit() or len(payload.new_pin) != 4:
        raise HTTPException(400, "New PIN must be 4 digits")
    cfg = await get_app_config()
    if not cfg:
        raise HTTPException(404, "App not set up")
    if not verify_password(payload.current_pin, cfg["pin_hash"]):
        raise HTTPException(401, "Current PIN is incorrect")
    await db.app_config.update_one({"_id": APP_CONFIG_ID}, {"$set": {"pin_hash": hash_password(payload.new_pin)}})
    return {"ok": True}

@api_router.post("/auth/email-password")
async def set_email_password(payload: EmailPasswordUpdateIn, user: dict = Depends(get_current_user)):
    email = payload.email.strip().lower()
    if "@" not in email:
        raise HTTPException(400, "Enter a valid email")
    if len(payload.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    cfg = await get_app_config()
    if not cfg:
        raise HTTPException(404, "App not set up")
    await db.app_config.update_one(
        {"_id": APP_CONFIG_ID},
        {"$set": {"email": email, "email_hash": hash_password(payload.password), "updated_at": now_iso()}}
    )
    return {"ok": True, "email": email}

@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    cfg = await get_app_config()
    return {
        **user,
        "shop_name": cfg.get("shop_name") if cfg else user.get("name"),
        "email": cfg.get("email") if cfg else None,
        "has_email": bool(cfg.get("email_hash")) if cfg else False,
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
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
    photos: List[str] = []

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
    photos: Optional[List[str]] = None
    status: Optional[str] = None

class MovementIn(BaseModel):
    device_id: str
    movement_type: str
    pickup_self: Optional[bool] = True
    picked_up_by_name: Optional[str] = ""
    picked_up_by_phone: Optional[str] = ""
    expected_return_date: Optional[str] = None
    remarks: Optional[str] = ""

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
    if sn and await db.devices.find_one({"serial_number": sn}):
        raise HTTPException(400, "Serial number already exists")
    device_id = f"dev_{uuid.uuid4().hex[:12]}"
    job_number = await generate_job_number()
    qr_svg = generate_qr_svg(device_id)
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
        "photos": payload.photos or [],
        "qr_code": qr_svg,
        "status": "in_stock" if payload.category == "stock" else "in_repair",
        "inward_date": t, "outward_date": None, "created_by": user["user_id"],
        "created_at": t, "updated_at": t,
    }
    await db.devices.insert_one(doc)
    await db.movements.insert_one({
        "movement_id": f"mov_{uuid.uuid4().hex[:12]}", "device_id": device_id,
        "job_number": job_number, "movement_type": "inward",
        "customer_name": payload.customer_name, "customer_phone": payload.customer_phone,
        "issue_description": payload.issue_description, "remarks": "",
        "performed_by": user["user_id"], "performed_by_name": user.get("name", ""),
        "created_at": t,
    })
    doc.pop("_id", None)
    return doc

@api_router.get("/devices")
async def list_devices(status: Optional[str] = None, category: Optional[str] = None,
                       q: Optional[str] = None, user: dict = Depends(get_current_user)):
    filt = {}
    if status: filt["status"] = status
    if category: filt["category"] = category
    if q:
        filt["$or"] = [
            {"serial_number": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"model": {"$regex": q, "$options": "i"}},
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"customer_phone": {"$regex": q, "$options": "i"}},
            {"job_number": {"$regex": q, "$options": "i"}},
        ]
    return await db.devices.find(filt, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.get("/devices/export/csv")
async def export_csv(user: dict = Depends(get_current_user)):
    devices = await db.devices.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)
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
    doc = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Device not found")
    return doc

@api_router.get("/public/job/{device_id}")
async def get_job_public(device_id: str):
    """Public route — no auth required. Used by QR code scans."""
    doc = await db.devices.find_one({"device_id": device_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Device not found")
    return doc

@api_router.patch("/devices/{device_id}")
async def update_device(device_id: str, payload: DeviceUpdate, user: dict = Depends(get_current_user)):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "serial_number" in data: data["serial_number"] = data["serial_number"].upper()
    data["updated_at"] = now_iso()
    result = await db.devices.update_one({"device_id": device_id}, {"$set": data})
    if result.matched_count == 0: raise HTTPException(404, "Device not found")
    return await db.devices.find_one({"device_id": device_id}, {"_id": 0})

@api_router.delete("/devices/{device_id}")
async def delete_device(device_id: str, user: dict = Depends(get_current_user)):
    await db.devices.delete_one({"device_id": device_id})
    await db.movements.delete_many({"device_id": device_id})
    return {"ok": True}

@api_router.post("/movements")
async def create_movement(payload: MovementIn, user: dict = Depends(get_current_user)):
    device = await db.devices.find_one({"device_id": payload.device_id}, {"_id": 0})
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
    await db.movements.insert_one({
        "movement_id": f"mov_{uuid.uuid4().hex[:12]}", "device_id": payload.device_id,
        "job_number": device.get("job_number"), "movement_type": mt,
        "customer_name": device.get("customer_name", ""), "customer_phone": device.get("customer_phone", ""),
        "picked_up_by_name": picker_name, "picked_up_by_phone": picker_phone,
        "pickup_relationship": pickup_rel, "expected_return_date": payload.expected_return_date,
        "remarks": payload.remarks or "", "performed_by": user["user_id"],
        "performed_by_name": user.get("name", ""), "created_at": t,
    })
    update = {"status": new_status, "updated_at": t}
    if mt == "outward":
        update.update({"picked_up_by_name": picker_name, "picked_up_by_phone": picker_phone,
                       "pickup_relationship": pickup_rel, "expected_return_date": payload.expected_return_date,
                       "outward_date": t})
    else:
        update.update({"inward_date": t, "picked_up_by_name": "", "picked_up_by_phone": "",
                       "pickup_relationship": "", "expected_return_date": None})
    await db.devices.update_one({"device_id": payload.device_id}, {"$set": update})
    return await db.devices.find_one({"device_id": payload.device_id}, {"_id": 0})

@api_router.get("/movements")
async def list_movements(device_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    filt = {"device_id": device_id} if device_id else {}
    return await db.movements.find(filt, {"_id": 0}).sort("created_at", -1).to_list(2000)

@api_router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    total = await db.devices.count_documents({})
    in_stock = await db.devices.count_documents({"status": "in_stock"})
    issued = await db.devices.count_documents({"status": "issued"})
    in_repair = await db.devices.count_documents({"status": "in_repair"})
    laptops = await db.devices.count_documents({"device_type": "Laptop"})
    desktops = await db.devices.count_documents({"device_type": "Desktop"})
    overdue = await db.devices.count_documents({
        "status": "issued", "expected_return_date": {"$lt": now_iso(), "$ne": None}})
    monthly_inward = await db.movements.count_documents({"movement_type": "inward", "created_at": {"$gte": month_start}})
    monthly_outward = await db.movements.count_documents({"movement_type": "outward", "created_at": {"$gte": month_start}})
    recent = await db.movements.find({}, {"_id": 0}).sort("created_at", -1).to_list(8)
    return {"total": total, "in_stock": in_stock, "issued": issued, "in_repair": in_repair,
            "overdue": overdue, "laptops": laptops, "desktops": desktops,
            "monthly_inward": monthly_inward, "monthly_outward": monthly_outward,
            "recent_movements": recent}

# ── Photo Upload ──────────────────────────────────────────────────────────────
@api_router.post("/upload")
async def upload_photo(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "Only images allowed")
    ext = (file.filename.split(".")[-1] if file.filename and "." in file.filename else "bin").lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    data = await file.read()
    if len(data) > 8 * 1024 * 1024: raise HTTPException(400, "File too large (max 8MB)")
    dest = UPLOADS_DIR / filename
    dest.write_bytes(data)
    storage_path = f"uploads/{filename}"
    await db.files.insert_one({
        "id": str(uuid.uuid4()), "storage_path": storage_path,
        "original_filename": file.filename, "content_type": file.content_type,
        "size": len(data), "owner": user["user_id"], "is_deleted": False, "created_at": now_iso(),
    })
    return {"path": storage_path}

@api_router.get("/files/{path:path}")
async def serve_file(path: str, request: Request, auth: Optional[str] = Query(None)):
    if auth:
        try: jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except Exception: raise HTTPException(401, "Invalid token")
    else:
        await get_current_user(request)
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record: raise HTTPException(404, "File not found")
    filename = path.split("/")[-1]
    file_path = UPLOADS_DIR / filename
    if not file_path.exists(): raise HTTPException(404, "File not found on disk")
    return FastAPIResponse(content=file_path.read_bytes(), media_type=record.get("content_type", "application/octet-stream"))

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

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    type: Optional[Literal["credit", "debit"]] = None
    category: Optional[str] = None
    note: Optional[str] = None
    date: Optional[str] = None
    payment_method: Optional[str] = None

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
    customers = await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(2000)
    out = []
    for c in customers:
        agg = await db.transactions.aggregate([
            {"$match": {"customer_id": c["id"]}},
            {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}},
        ]).to_list(10)
        totals = {row["_id"]: row["total"] for row in agg}
        c["balance"] = round(totals.get("credit", 0) - totals.get("debit", 0), 2)
        c["total_credit"] = round(totals.get("credit", 0), 2)
        c["total_debit"] = round(totals.get("debit", 0), 2)
        out.append(c)
    return out

@api_router.post("/customers")
async def create_customer(body: CustomerCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name, "phone": body.phone,
           "email": body.email, "note": body.note, "avatar_color": body.avatar_color or "#E5E7EB", "created_at": now_iso()}
    await db.customers.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.post("/customers/bulk")
async def create_customers_bulk(body: BulkCustomerRequest, user: dict = Depends(get_current_user)):
    existing = await db.customers.find({}, {"_id": 0, "name": 1, "phone": 1}).to_list(5000)
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
        await db.customers.insert_one(doc)
        added += 1
    return {"added": added}

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(get_current_user)):
    doc = await db.customers.find_one({"id": customer_id}, {"_id": 0})
    if not doc: raise HTTPException(404, "Customer not found")
    return doc

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, body: CustomerUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        res = await db.customers.update_one({"id": customer_id}, {"$set": update})
        if res.matched_count == 0: raise HTTPException(404, "Customer not found")
    return await db.customers.find_one({"id": customer_id}, {"_id": 0})

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(get_current_user)):
    res = await db.customers.delete_one({"id": customer_id})
    if res.deleted_count == 0: raise HTTPException(404, "Customer not found")
    await db.transactions.delete_many({"customer_id": customer_id})
    return {"ok": True}

@api_router.get("/customers/export/csv")
async def export_customers_csv(user: dict = Depends(get_current_user)):
    customers = await db.customers.find({}, {"_id": 0}).sort("name", 1).to_list(10000)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Phone", "Email", "Note", "Created At"])
    for c in customers:
        w.writerow([c.get("name",""), c.get("phone",""), c.get("email",""), c.get("note",""), c.get("created_at","")])
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="contacts.csv"'})

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
    return await db.transactions.find(q, {"_id": 0}).sort("date", -1).to_list(limit)

@api_router.post("/customers/import-file")
async def import_contacts_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    filename = (file.filename or "").lower()
    contacts = []

    if filename.endswith(".vcf") or filename.endswith(".vcard"):
        for card in text.split("BEGIN:VCARD"):
            if not card.strip(): continue
            name = phone = None
            for line in card.splitlines():
                line = line.strip()
                if line.upper().startswith("FN:"):
                    name = line[3:].strip()
                elif re.match(r"TEL", line, re.I) and ":" in line:
                    raw = line.split(":")[-1].strip()
                    phone = re.sub(r"[^\d+]", "", raw) or None
            if name:
                contacts.append({"name": name, "phone": phone})
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

    existing = await db.customers.find({}, {"_id": 0, "name": 1, "phone": 1}).to_list(5000)
    keys = {(c.get("name","").lower().strip(), re.sub(r"[\s\-]","", c.get("phone") or "")) for c in existing}
    added = 0
    for item in contacts:
        name = item["name"].strip()
        if not name: continue
        phone_clean = re.sub(r"[\s\-]", "", item.get("phone") or "")
        if (name.lower(), phone_clean) in keys: continue
        keys.add((name.lower(), phone_clean))
        await db.customers.insert_one({"id": str(uuid.uuid4()), "name": name,
            "phone": item.get("phone"), "note": None, "avatar_color": "#E5E7EB", "created_at": now_iso()})
        added += 1
    return {"added": added, "total": len(contacts), "skipped": len(contacts) - added}

@api_router.post("/transactions")
async def create_transaction(body: TransactionCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "amount": body.amount, "type": body.type,
           "category": body.category or "Other", "note": body.note,
           "payment_method": body.payment_method or "Cash",
           "customer_id": body.customer_id, "date": body.date or now_iso(), "created_at": now_iso()}
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/transactions/{txn_id}")
async def update_transaction(txn_id: str, body: TransactionUpdate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if update:
        res = await db.transactions.update_one({"id": txn_id}, {"$set": update})
        if res.matched_count == 0: raise HTTPException(404, "Transaction not found")
    return await db.transactions.find_one({"id": txn_id}, {"_id": 0})

@api_router.delete("/transactions/{txn_id}")
async def delete_transaction(txn_id: str, user: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": txn_id})
    if res.deleted_count == 0: raise HTTPException(404, "Transaction not found")
    return {"ok": True}

@api_router.get("/transactions/export/csv")
async def export_transactions_csv(user: dict = Depends(get_current_user)):
    txns = await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(50000)
    customer_ids = list({t.get("customer_id") for t in txns if t.get("customer_id")})
    customers = await db.customers.find({"id": {"$in": customer_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(5000)
    cmap = {c["id"]: c["name"] for c in customers}
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Date", "Type", "Amount", "Customer", "Category", "Payment Method", "Note"])
    for t in txns:
        w.writerow([t.get("date",""), t.get("type",""), t.get("amount",""),
                    cmap.get(t.get("customer_id",""),""), t.get("category",""),
                    t.get("payment_method",""), t.get("note","")])
    return StreamingResponse(iter([out.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ledger.csv"'})

# ── Ledger: Categories ────────────────────────────────────────────────────────
@api_router.get("/categories")
async def list_categories(type: Optional[str] = None, user: dict = Depends(get_current_user)):
    cats = await db.categories.find({}, {"_id": 0}).to_list(500)
    if not cats or any("type" not in c for c in cats):
        await db.categories.delete_many({})
        cats = [{"id": str(uuid.uuid4()), **c} for c in DEFAULT_CATEGORIES]
        await db.categories.insert_many(cats)
        cats = [{k: v for k, v in c.items() if k != "_id"} for c in cats]
    if type in ("credit", "debit"):
        cats = [c for c in cats if c.get("type") in (type, "both")]
    return cats

@api_router.post("/categories")
async def create_category(body: CategoryCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "name": body.name, "icon": body.icon,
           "color": body.color, "type": body.type}
    await db.categories.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/categories/{cat_id}")
async def update_category(cat_id: str, body: CategoryCreate, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in {"name": body.name, "type": body.type, "icon": body.icon, "color": body.color}.items() if v is not None}
    res = await db.categories.update_one({"id": cat_id}, {"$set": update})
    if res.matched_count == 0: raise HTTPException(404, "Category not found")
    return await db.categories.find_one({"id": cat_id}, {"_id": 0})

@api_router.delete("/categories/{cat_id}")
async def delete_category(cat_id: str, user: dict = Depends(get_current_user)):
    res = await db.categories.delete_one({"id": cat_id})
    if res.deleted_count == 0: raise HTTPException(404, "Category not found")
    return {"ok": True}

# ── Ledger: Reminders ─────────────────────────────────────────────────────────
@api_router.get("/reminders")
async def list_reminders(user: dict = Depends(get_current_user)):
    return await db.reminders.find({}, {"_id": 0}).sort("due_date", 1).to_list(500)

@api_router.post("/reminders")
async def create_reminder(body: ReminderCreate, user: dict = Depends(get_current_user)):
    doc = {"id": str(uuid.uuid4()), "customer_id": body.customer_id, "title": body.title,
           "due_date": body.due_date, "amount": body.amount, "completed": False, "created_at": now_iso()}
    await db.reminders.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/reminders/{reminder_id}")
async def toggle_reminder(reminder_id: str, completed: bool = True, user: dict = Depends(get_current_user)):
    res = await db.reminders.update_one({"id": reminder_id}, {"$set": {"completed": completed}})
    if res.matched_count == 0: raise HTTPException(404, "Reminder not found")
    return {"ok": True}

@api_router.delete("/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str, user: dict = Depends(get_current_user)):
    res = await db.reminders.delete_one({"id": reminder_id})
    if res.deleted_count == 0: raise HTTPException(404, "Reminder not found")
    return {"ok": True}

# ── Ledger: Reports ───────────────────────────────────────────────────────────
@api_router.get("/reports/summary")
async def reports_summary(period: str = "monthly", user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
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
    txns = await db.transactions.find({"date": {"$gte": start.isoformat()}}, {"_id": 0}).to_list(5000)
    series = []
    for i in range(days):
        day_start = start + timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        credit = sum(t["amount"] for t in txns if t["type"] == "credit" and day_start.isoformat() <= t.get("date","") < day_end.isoformat())
        debit = sum(t["amount"] for t in txns if t["type"] == "debit" and day_start.isoformat() <= t.get("date","") < day_end.isoformat())
        series.append({"label": day_start.strftime("%d/%m"), "credit": round(credit, 2), "debit": round(debit, 2)})
    cat_map = {}
    for t in txns:
        c = t.get("category", "Other")
        if c not in cat_map: cat_map[c] = {"category": c, "credit": 0.0, "debit": 0.0}
        cat_map[c][t["type"]] += t["amount"]
    total_credit = sum(t["amount"] for t in txns if t["type"] == "credit")
    total_debit = sum(t["amount"] for t in txns if t["type"] == "debit")
    return {"period": period, "total_credit": round(total_credit, 2), "total_debit": round(total_debit, 2),
            "net": round(total_credit - total_debit, 2), "series": series,
            "by_category": list(cat_map.values())}

# ── Combined Dashboard ────────────────────────────────────────────────────────
@api_router.get("/ledger/dashboard")
async def ledger_dashboard(user: dict = Depends(get_current_user)):
    agg = await db.transactions.aggregate([
        {"$group": {"_id": "$type", "total": {"$sum": "$amount"}}}]).to_list(10)
    totals = {row["_id"]: row["total"] for row in agg}
    recent = await db.transactions.find({}, {"_id": 0}).sort("date", -1).to_list(8)
    customer_count = await db.customers.count_documents({})
    return {"total_credit": round(totals.get("credit", 0), 2),
            "total_debit": round(totals.get("debit", 0), 2),
            "net_balance": round(totals.get("credit", 0) - totals.get("debit", 0), 2),
            "customer_count": customer_count, "recent_transactions": recent}

# ── Catalog: Default Data ─────────────────────────────────────────────────────
DEFAULT_BRANDS = [
    {"name": "Apple", "models": [
        "MacBook Air M1 (2020)", "MacBook Air M2 (2022)", "MacBook Air 13\" M3 (2024)",
        "MacBook Air 15\" M3 (2024)", "MacBook Air 13\" M4 (2025)", "MacBook Air 15\" M4 (2025)",
        "MacBook Pro 13\" M1 (2020)", "MacBook Pro 14\" M1 Pro (2021)", "MacBook Pro 16\" M1 Pro (2021)",
        "MacBook Pro 14\" M1 Max (2021)", "MacBook Pro 16\" M1 Max (2021)",
        "MacBook Pro 13\" M2 (2022)", "MacBook Pro 14\" M2 Pro (2023)", "MacBook Pro 16\" M2 Pro (2023)",
        "MacBook Pro 14\" M2 Max (2023)", "MacBook Pro 16\" M2 Max (2023)",
        "MacBook Pro 14\" M3 (2024)", "MacBook Pro 14\" M3 Pro (2024)", "MacBook Pro 16\" M3 Pro (2024)",
        "MacBook Pro 14\" M3 Max (2024)", "MacBook Pro 16\" M3 Max (2024)",
        "MacBook Pro 14\" M4 (2024)", "MacBook Pro 16\" M4 (2024)",
        "MacBook Pro 14\" M4 Pro (2025)", "MacBook Pro 16\" M4 Pro (2025)",
        "MacBook Air (2018) Intel", "MacBook Air (2019) Intel", "MacBook Air (2020) Intel",
        "MacBook Pro 13\" (2017) Intel", "MacBook Pro 13\" (2018) Intel",
        "MacBook Pro 13\" (2019) Intel", "MacBook Pro 13\" (2020) Intel",
        "MacBook Pro 15\" (2017) Intel", "MacBook Pro 15\" (2018) Intel",
        "MacBook Pro 15\" (2019) Intel", "MacBook Pro 16\" (2019) Intel", "MacBook Pro 16\" (2020) Intel",
        "iMac 21.5\" (2019) Intel", "iMac 24\" M1 (2021)", "iMac 24\" M3 (2023)", "iMac 24\" M4 (2024)",
        "Mac mini M1 (2020)", "Mac mini M2 (2023)", "Mac mini M4 (2024)",
        "Other",
    ]},
    {"name": "Dell", "models": [
        "Inspiron 14", "Inspiron 15", "Inspiron 16", "Inspiron 15 3000", "Inspiron 15 5000", "Inspiron 15 7000",
        "Latitude 5410", "Latitude 5420", "Latitude 5430", "Latitude 5440",
        "Latitude 7420", "Latitude 7430", "Latitude 7440",
        "XPS 13", "XPS 15", "XPS 17",
        "Vostro 3000", "Vostro 5000",
        "G15 Gaming", "G16 Gaming",
        "Precision 3560", "Precision 5560",
        "Other",
    ]},
    {"name": "HP", "models": [
        "Pavilion 14", "Pavilion 15", "Pavilion 16",
        "Envy 13", "Envy 15", "Envy 17", "Envy x360 13", "Envy x360 15",
        "Spectre x360 13", "Spectre x360 14", "Spectre x360 16",
        "EliteBook 840 G8", "EliteBook 840 G9", "EliteBook 850 G8", "EliteBook 1040",
        "ProBook 440", "ProBook 450", "ProBook 455",
        "Omen 15", "Omen 16", "Omen 17",
        "HP Laptop 14", "HP Laptop 15",
        "Other",
    ]},
    {"name": "Lenovo", "models": [
        "ThinkPad X1 Carbon Gen 9", "ThinkPad X1 Carbon Gen 10", "ThinkPad X1 Carbon Gen 11",
        "ThinkPad E14", "ThinkPad E15", "ThinkPad E16",
        "ThinkPad T14", "ThinkPad T15", "ThinkPad L14", "ThinkPad L15",
        "IdeaPad Slim 3", "IdeaPad Slim 5", "IdeaPad Slim 7",
        "IdeaPad 3", "IdeaPad 5", "IdeaPad Gaming 3",
        "Legion 5", "Legion 5 Pro", "Legion 7", "Legion Slim 5",
        "Yoga 7", "Yoga 9", "Yoga Slim 7",
        "V14", "V15",
        "Other",
    ]},
    {"name": "Asus", "models": [
        "VivoBook 14", "VivoBook 15", "VivoBook 15X", "VivoBook 16",
        "VivoBook S14", "VivoBook S15",
        "ZenBook 13", "ZenBook 14", "ZenBook 14 OLED", "ZenBook 15",
        "ROG Strix G15", "ROG Strix G17", "ROG Zephyrus G14", "ROG Zephyrus G15",
        "TUF Gaming A15", "TUF Gaming F15", "TUF Gaming F17",
        "ExpertBook B1", "ExpertBook B9",
        "Other",
    ]},
    {"name": "Acer", "models": [
        "Aspire 3", "Aspire 5", "Aspire 7",
        "Aspire Lite 14", "Aspire Lite 15",
        "Swift 3", "Swift 5", "Swift X 14", "Swift X 16",
        "Nitro 5", "Nitro V 15", "Predator Helios 300", "Predator Helios Neo 16",
        "Extensa 15", "TravelMate P2", "TravelMate P4",
        "Other",
    ]},
    {"name": "MSI", "models": [
        "Modern 14", "Modern 15",
        "Prestige 14", "Prestige 15",
        "GF63 Thin", "GL65 Leopard", "GS65 Stealth",
        "Raider GE67 HX", "Creator M16", "Summit E16",
        "Sword 15", "Pulse GL66",
        "Other",
    ]},
    {"name": "Samsung", "models": [
        "Galaxy Book 2", "Galaxy Book 2 Pro", "Galaxy Book 2 Pro 360",
        "Galaxy Book 3", "Galaxy Book 3 Pro", "Galaxy Book 3 Ultra",
        "Galaxy Book 4", "Galaxy Book 4 Pro", "Galaxy Book 4 Ultra",
        "Other",
    ]},
    {"name": "Microsoft", "models": [
        "Surface Pro 7", "Surface Pro 8", "Surface Pro 9", "Surface Pro 10",
        "Surface Laptop 4", "Surface Laptop 5", "Surface Laptop 6",
        "Surface Laptop Go 2", "Surface Laptop Go 3",
        "Surface Go 3",
        "Other",
    ]},
    {"name": "Toshiba / Dynabook", "models": [
        "Satellite Pro L50", "Satellite Pro C50",
        "Tecra A50", "Tecra X40",
        "Portege Z30", "Portege X30L",
        "Other",
    ]},
    {"name": "Sony", "models": [
        "VAIO E Series", "VAIO S Series", "VAIO SX14", "VAIO FE Series",
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
    "Software Installation", "Other",
]

# ── Catalog Routes ────────────────────────────────────────────────────────────
class BrandCreate(BaseModel):
    name: str

class ModelAdd(BaseModel):
    model_name: str

class IssueCategoryCreate(BaseModel):
    name: str

@api_router.get("/catalog/brands")
async def get_brands(user: dict = Depends(get_current_user)):
    return await db.brands.find({}, {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/catalog/brands")
async def add_brand(body: BrandCreate, user: dict = Depends(get_current_user)):
    if await db.brands.find_one({"name": body.name}):
        raise HTTPException(400, "Brand already exists")
    doc = {"brand_id": str(uuid.uuid4()), "name": body.name.strip(), "models": ["Other"]}
    await db.brands.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/catalog/brands/{brand_id}")
async def delete_brand(brand_id: str, user: dict = Depends(get_current_user)):
    r = await db.brands.delete_one({"brand_id": brand_id})
    if r.deleted_count == 0: raise HTTPException(404, "Brand not found")
    return {"ok": True}

@api_router.post("/catalog/brands/{brand_id}/models")
async def add_model_to_brand(brand_id: str, body: ModelAdd, user: dict = Depends(get_current_user)):
    r = await db.brands.update_one({"brand_id": brand_id}, {"$addToSet": {"models": body.model_name.strip()}})
    if r.matched_count == 0: raise HTTPException(404, "Brand not found")
    return {"ok": True}

@api_router.delete("/catalog/brands/{brand_id}/models/{model_name:path}")
async def delete_model_from_brand(brand_id: str, model_name: str, user: dict = Depends(get_current_user)):
    r = await db.brands.update_one({"brand_id": brand_id}, {"$pull": {"models": model_name}})
    if r.matched_count == 0: raise HTTPException(404, "Brand not found")
    return {"ok": True}

@api_router.get("/catalog/issue-categories")
async def get_issue_categories(user: dict = Depends(get_current_user)):
    return await db.issue_categories.find({}, {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.post("/catalog/issue-categories")
async def add_issue_category(body: IssueCategoryCreate, user: dict = Depends(get_current_user)):
    if await db.issue_categories.find_one({"name": body.name}):
        raise HTTPException(400, "Category already exists")
    doc = {"category_id": str(uuid.uuid4()), "name": body.name.strip()}
    await db.issue_categories.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/catalog/issue-categories/{category_id}")
async def delete_issue_category(category_id: str, user: dict = Depends(get_current_user)):
    r = await db.issue_categories.delete_one({"category_id": category_id})
    if r.deleted_count == 0: raise HTTPException(404, "Category not found")
    return {"ok": True}

class BankCreate(BaseModel):
    name: str

@api_router.get("/catalog/banks")
async def get_banks(user: dict = Depends(get_current_user)):
    return await db.banks.find({}, {"_id": 0}).to_list(100)

@api_router.post("/catalog/banks")
async def add_bank(body: BankCreate, user: dict = Depends(get_current_user)):
    if await db.banks.find_one({"name": body.name}):
        raise HTTPException(400, "Bank already exists")
    doc = {"bank_id": str(uuid.uuid4()), "name": body.name.strip()}
    await db.banks.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.put("/catalog/banks/{bank_id}")
async def update_bank(bank_id: str, body: dict, user: dict = Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    if not name: raise HTTPException(400, "Name is required")
    r = await db.banks.update_one({"bank_id": bank_id}, {"$set": {"name": name}})
    if r.matched_count == 0: raise HTTPException(404, "Bank not found")
    return await db.banks.find_one({"bank_id": bank_id}, {"_id": 0})

@api_router.delete("/catalog/banks/{bank_id}")
async def delete_bank(bank_id: str, user: dict = Depends(get_current_user)):
    r = await db.banks.delete_one({"bank_id": bank_id})
    if r.deleted_count == 0: raise HTTPException(404, "Bank not found")
    return {"ok": True}

# ── Health ───────────────────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"message": "Krish Computer Store API", "version": "1.0.0"}

# ── Startup ──────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    await db.users.create_index("user_id", unique=True)
    await db.devices.create_index("device_id", unique=True)
    # sparse=True so devices without serial numbers don't conflict
    try:
        await db.devices.drop_index("serial_number_1")
    except Exception:
        pass
    await db.devices.create_index("serial_number", unique=True, sparse=True)
    await db.movements.create_index("device_id")
    await db.transactions.create_index("customer_id")
    await db.transactions.create_index("date")
    # Seed catalog if empty
    if await db.brands.count_documents({}) == 0:
        await db.brands.insert_many([
            {"brand_id": str(uuid.uuid4()), "name": b["name"], "models": b["models"]}
            for b in DEFAULT_BRANDS
        ])
    if await db.issue_categories.count_documents({}) == 0:
        await db.issue_categories.insert_many([
            {"category_id": str(uuid.uuid4()), "name": n} for n in DEFAULT_ISSUE_CATEGORIES
        ])
    if await db.banks.count_documents({}) == 0:
        await db.banks.insert_many([
            {"bank_id": str(uuid.uuid4()), "name": n} for n in DEFAULT_BANKS
        ])

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

app.include_router(api_router)

# ponytail: explicit origins required for credentials; '*' breaks withCredentials
_raw_origins = os.environ.get('CORS_ORIGINS', '').strip()
cors_origins = [o.strip() for o in _raw_origins.split(',') if o.strip()] if _raw_origins else None
app.add_middleware(CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=bool(cors_origins),
    allow_methods=["*"], allow_headers=["*"])
