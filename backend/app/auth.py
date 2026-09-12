import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Request, Response
from pydantic import BaseModel, EmailStr
import bcrypt
import jwt
import httpx

from backend.app.config import (
    JWT_SECRET, JWT_ALGO, JWT_EXP_DAYS,
    EMERGENT_AUTH_SESSION_URL, SESSION_DAYS
)
from backend.app.db import db

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------- Utilities ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def extract_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if token:
        return token
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    return None

async def resolve_session_user(token: str) -> Optional[Dict[str, Any]]:
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    return await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password": 0})

async def get_current_user(request: Request):
    token = extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    user = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    except jwt.PyJWTError:
        user = await resolve_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Optional[str] = "Urban Planner"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleSessionIn(BaseModel):
    session_id: str

# ---------- Auth Routes ----------
@router.post("/register")
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user = {"id": uid, "email": body.email, "name": body.name, "role": body.role,
            "password": hashed, "created_at": now_iso()}
    await db.users.insert_one(user)
    return {"token": make_token(uid), "user": {"id": uid, "email": body.email, "name": body.name, "role": body.role}}

@router.post("/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": make_token(user["id"]),
            "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role", "Urban Planner")}}

@router.post("/demo")
async def demo_login():
    email = "demo@smartscape.ai"
    user = await db.users.find_one({"email": email})
    if not user:
        uid = str(uuid.uuid4())
        hashed = bcrypt.hashpw(b"smartscape-demo", bcrypt.gensalt()).decode()
        user = {"id": uid, "email": email, "name": "SIH Demo Planner", "role": "Urban Planner",
                "password": hashed, "created_at": now_iso()}
        await db.users.insert_one(user)
    return {"token": make_token(user["id"]),
            "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role")}}

@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user

@router.post("/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    try:
        async with httpx.AsyncClient(timeout=20) as http:
            r = await http.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": body.session_id})
    except (httpx.RequestError, httpx.TimeoutException):
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = r.json()

    user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if user:
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"name": data.get("name") or user.get("name"),
                                            "picture": data.get("picture"),
                                            "auth_provider": "google",
                                            "updated_at": now_iso()}})
        uid = user["id"]
    else:
        uid = str(uuid.uuid4())
        await db.users.insert_one({"id": uid, "email": data["email"], "name": data.get("name") or data["email"],
                                   "role": "Urban Planner", "picture": data.get("picture"),
                                   "auth_provider": "google", "created_at": now_iso()})

    session_token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"user_id": uid, "session_token": session_token,
                  "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
                  "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=SESSION_DAYS * 24 * 3600)
    out = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
    return {"token": session_token, "user": out}

@router.post("/logout")
async def logout(request: Request, response: Response):
    token = extract_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}
