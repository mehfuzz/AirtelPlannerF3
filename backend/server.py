from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
import os
import logging
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import secrets

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "default-secret-change-in-production")

# Password utilities
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# JWT utilities
def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# Auth helper
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user.get("name", ""),
            "role": user.get("role", "user")
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# Create the main app
app = FastAPI()

# Create routers
api_router = APIRouter(prefix="/api")
auth_router = APIRouter(prefix="/auth")
users_router = APIRouter(prefix="/users")
weeks_router = APIRouter(prefix="/weeks")

# Pydantic Models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str

class TaskCreate(BaseModel):
    title: str
    due_date: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    due_date: Optional[str] = None

class CommentCreate(BaseModel):
    text: str

class WeekUpdate(BaseModel):
    title: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class KeepPasswordRequest(BaseModel):
    keep_default: bool = True

# Auth endpoints
@auth_router.post("/login")
async def login(request: LoginRequest, response: Response):
    email = request.email.lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    # Check if this is first login (password not changed yet) for non-admin users
    password_changed = user.get("password_changed", False)
    is_first_login = user.get("role", "user") != "admin" and not password_changed
    
    return {
        "id": user_id,
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "password_changed": password_changed,
        "is_first_login": is_first_login
    }

@auth_router.post("/change-password")
async def change_password(request: PasswordChangeRequest, user: dict = Depends(get_current_user)):
    # Get user from database
    db_user = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    if not verify_password(request.current_password, db_user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Hash new password and update
    new_hash = hash_password(request.new_password)
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"password_hash": new_hash, "password_changed": True}}
    )
    
    return {"message": "Password changed successfully"}

@auth_router.post("/keep-password")
async def keep_password(user: dict = Depends(get_current_user)):
    # Mark that user has acknowledged the password prompt
    await db.users.update_one(
        {"_id": ObjectId(user["id"])},
        {"$set": {"password_changed": True}}
    )
    
    return {"message": "Password preference saved"}

@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out successfully"}

@auth_router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    # Get full user data including password_changed status
    db_user = await db.users.find_one({"_id": ObjectId(user["id"])})
    password_changed = db_user.get("password_changed", False) if db_user else False
    is_first_login = user["role"] != "admin" and not password_changed
    
    return {
        **user,
        "password_changed": password_changed,
        "is_first_login": is_first_login
    }

# User management endpoints (admin only)
@users_router.get("/", response_model=List[UserResponse])
@users_router.get("", response_model=List[UserResponse])
async def get_users(user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await db.users.find({}, {"_id": 1, "email": 1, "name": 1, "role": 1}).to_list(1000)
    return [{"id": str(u["_id"]), "email": u["email"], "name": u.get("name", ""), "role": u.get("role", "user")} for u in users]

@users_router.post("/", response_model=UserResponse)
@users_router.post("", response_model=UserResponse)
async def create_user(request: UserCreate, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    email = request.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")
    
    hashed = hash_password(request.password)
    new_user = {
        "email": email,
        "password_hash": hashed,
        "name": request.name,
        "role": "user",
        "password_changed": False,
        "created_at": datetime.now(timezone.utc)
    }
    result = await db.users.insert_one(new_user)
    
    return {
        "id": str(result.inserted_id),
        "email": email,
        "name": request.name,
        "role": "user"
    }

@users_router.delete("/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    result = await db.users.delete_one({"_id": ObjectId(user_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "User deleted"}

# Week and Task endpoints
@weeks_router.get("/")
@weeks_router.get("")
async def get_weeks(user: dict = Depends(get_current_user)):
    weeks = await db.weeks.find({}, {"_id": 0}).sort("week_number", 1).to_list(100)
    return weeks

@weeks_router.put("/{week_id}")
async def update_week(week_id: str, update: WeekUpdate, user: dict = Depends(get_current_user)):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_data["updated_by"] = user["id"]
    
    result = await db.weeks.update_one({"id": week_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Week not found")
    
    week = await db.weeks.find_one({"id": week_id}, {"_id": 0})
    return week

@weeks_router.post("/{week_id}/tasks")
async def add_task(week_id: str, task: TaskCreate, user: dict = Depends(get_current_user)):
    task_id = str(uuid.uuid4())
    new_task = {
        "id": task_id,
        "title": task.title,
        "completed": False,
        "due_date": task.due_date,
        "comments": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    
    result = await db.weeks.update_one(
        {"id": week_id},
        {"$push": {"tasks": new_task}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Week not found")
    
    return new_task

@weeks_router.put("/{week_id}/tasks/{task_id}")
async def update_task(week_id: str, task_id: str, update: TaskUpdate, user: dict = Depends(get_current_user)):
    week = await db.weeks.find_one({"id": week_id}, {"_id": 0})
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    task_index = None
    for i, task in enumerate(week.get("tasks", [])):
        if task["id"] == task_id:
            task_index = i
            break
    
    if task_index is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_fields = {}
    if update.title is not None:
        update_fields[f"tasks.{task_index}.title"] = update.title
    if update.completed is not None:
        update_fields[f"tasks.{task_index}.completed"] = update.completed
    if update.due_date is not None:
        update_fields[f"tasks.{task_index}.due_date"] = update.due_date
    
    update_fields[f"tasks.{task_index}.updated_at"] = datetime.now(timezone.utc).isoformat()
    update_fields[f"tasks.{task_index}.updated_by"] = user["id"]
    
    await db.weeks.update_one({"id": week_id}, {"$set": update_fields})
    
    updated_week = await db.weeks.find_one({"id": week_id}, {"_id": 0})
    return updated_week["tasks"][task_index]

@weeks_router.delete("/{week_id}/tasks/{task_id}")
async def delete_task(week_id: str, task_id: str, user: dict = Depends(get_current_user)):
    result = await db.weeks.update_one(
        {"id": week_id},
        {"$pull": {"tasks": {"id": task_id}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Week not found")
    
    return {"message": "Task deleted"}

@weeks_router.post("/{week_id}/tasks/{task_id}/comments")
async def add_comment(week_id: str, task_id: str, comment: CommentCreate, user: dict = Depends(get_current_user)):
    week = await db.weeks.find_one({"id": week_id}, {"_id": 0})
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    task_index = None
    for i, task in enumerate(week.get("tasks", [])):
        if task["id"] == task_id:
            task_index = i
            break
    
    if task_index is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    comment_id = str(uuid.uuid4())
    new_comment = {
        "id": comment_id,
        "text": comment.text,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"],
        "created_by_name": user["name"]
    }
    
    await db.weeks.update_one(
        {"id": week_id},
        {"$push": {f"tasks.{task_index}.comments": new_comment}}
    )
    
    return new_comment

@weeks_router.delete("/{week_id}/tasks/{task_id}/comments/{comment_id}")
async def delete_comment(week_id: str, task_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    week = await db.weeks.find_one({"id": week_id}, {"_id": 0})
    if not week:
        raise HTTPException(status_code=404, detail="Week not found")
    
    task_index = None
    for i, task in enumerate(week.get("tasks", [])):
        if task["id"] == task_id:
            task_index = i
            break
    
    if task_index is None:
        raise HTTPException(status_code=404, detail="Task not found")
    
    await db.weeks.update_one(
        {"id": week_id},
        {"$pull": {f"tasks.{task_index}.comments": {"id": comment_id}}}
    )
    
    return {"message": "Comment deleted"}

# Include routers
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(weeks_router)

@api_router.get("/")
async def root():
    return {"message": "Airtel PPO Tracker API"}

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Default week data
DEFAULT_WEEKS = [
    {
        "id": "week-1",
        "week_number": 1,
        "title": "Onboarding & Context Setting",
        "tasks": [
            {"id": "t1-1", "title": "Read all SCM SOP documents and org chart", "completed": False, "due_date": None, "comments": []},
            {"id": "t1-2", "title": "Meet Kushal Soni — understand expectations & KPIs", "completed": False, "due_date": None, "comments": []},
            {"id": "t1-3", "title": "Map the full SCM vertical structure", "completed": False, "due_date": None, "comments": []},
            {"id": "t1-4", "title": "Identify top 5 stakeholders to interview", "completed": False, "due_date": None, "comments": []},
            {"id": "t1-5", "title": "Set up internship tracker / working document", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-2",
        "week_number": 2,
        "title": "Process Discovery & Mapping",
        "tasks": [
            {"id": "t2-1", "title": "Conduct 8–10 stakeholder interviews across SCM verticals", "completed": False, "due_date": None, "comments": []},
            {"id": "t2-2", "title": "Map BAU workflows for top 3 SCM processes (SIPOC)", "completed": False, "due_date": None, "comments": []},
            {"id": "t2-3", "title": "Identify all manual / repetitive steps", "completed": False, "due_date": None, "comments": []},
            {"id": "t2-4", "title": "Create pain point log with Effort & Time scores", "completed": False, "due_date": None, "comments": []},
            {"id": "t2-5", "title": "Share first week update PPT with Kushal Soni", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-3",
        "week_number": 3,
        "title": "Deep-Dive Assessment",
        "tasks": [
            {"id": "t3-1", "title": "Score each process: Effort, Time, Recurrence, Data Availability, Automation Feasibility", "completed": False, "due_date": None, "comments": []},
            {"id": "t3-2", "title": "Build Impact–Effort matrix for all identified pain points", "completed": False, "due_date": None, "comments": []},
            {"id": "t3-3", "title": "Conduct 5-Whys on top 3 critical bottlenecks", "completed": False, "due_date": None, "comments": []},
            {"id": "t3-4", "title": "Draft initial process flow diagrams", "completed": False, "due_date": None, "comments": []},
            {"id": "t3-5", "title": "Identify quick-win automation opportunities", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-4",
        "week_number": 4,
        "title": "Benchmarking & Ideation",
        "tasks": [
            {"id": "t4-1", "title": "Research telecom SCM automation benchmarks (global & India)", "completed": False, "due_date": None, "comments": []},
            {"id": "t4-2", "title": "Identify AI/ML use cases applicable to Airtel SCM", "completed": False, "due_date": None, "comments": []},
            {"id": "t4-3", "title": "Draft automation solution concepts for top 5 pain points", "completed": False, "due_date": None, "comments": []},
            {"id": "t4-4", "title": "Prepare mid-internship update for Kushal Soni", "completed": False, "due_date": None, "comments": []},
            {"id": "t4-5", "title": "Get feedback and realign scope if needed", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-5",
        "week_number": 5,
        "title": "Solution Design",
        "tasks": [
            {"id": "t5-1", "title": "Design detailed solution proposals for top 3 automation opportunities", "completed": False, "due_date": None, "comments": []},
            {"id": "t5-2", "title": "Build Technology + Implementation roadmap per solution", "completed": False, "due_date": None, "comments": []},
            {"id": "t5-3", "title": "Draft Cost-Benefit / ROI estimates", "completed": False, "due_date": None, "comments": []},
            {"id": "t5-4", "title": "Create prototype or mock dashboard (Excel/Power BI/Figma)", "completed": False, "due_date": None, "comments": []},
            {"id": "t5-5", "title": "Review with DT team for technical feasibility", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-6",
        "week_number": 6,
        "title": "COE Handoff Framework",
        "tasks": [
            {"id": "t6-1", "title": "Build use-case pipeline document for COE", "completed": False, "due_date": None, "comments": []},
            {"id": "t6-2", "title": "Create structured templates: problem → solution → impact → effort → next steps", "completed": False, "due_date": None, "comments": []},
            {"id": "t6-3", "title": "Prioritize use cases for FY execution", "completed": False, "due_date": None, "comments": []},
            {"id": "t6-4", "title": "Prepare business case document for 2–3 priority automations", "completed": False, "due_date": None, "comments": []},
            {"id": "t6-5", "title": "Share structured docs with Kushal Soni for review", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-7",
        "week_number": 7,
        "title": "Final Deliverables",
        "tasks": [
            {"id": "t7-1", "title": "Complete end-to-end tracking framework", "completed": False, "due_date": None, "comments": []},
            {"id": "t7-2", "title": "Finalize all process maps, pain point logs, solution designs", "completed": False, "due_date": None, "comments": []},
            {"id": "t7-3", "title": "Build final internship impact report", "completed": False, "due_date": None, "comments": []},
            {"id": "t7-4", "title": "Prepare executive summary (1-pager) for CXOs", "completed": False, "due_date": None, "comments": []},
            {"id": "t7-5", "title": "Rehearse final presentation — Pyramid Principle / SCQA structure", "completed": False, "due_date": None, "comments": []}
        ]
    },
    {
        "id": "week-8",
        "week_number": 8,
        "title": "Final Presentation & PPO Push",
        "tasks": [
            {"id": "t8-1", "title": "Deliver final presentation to leadership", "completed": False, "due_date": None, "comments": []},
            {"id": "t8-2", "title": "Show: Problem → Analysis → Insights → Solutions → Impact → Roadmap", "completed": False, "due_date": None, "comments": []},
            {"id": "t8-3", "title": "Highlight quantified business impact (time saved, cost, efficiency %)", "completed": False, "due_date": None, "comments": []},
            {"id": "t8-4", "title": "Request feedback and express PPO interest", "completed": False, "due_date": None, "comments": []},
            {"id": "t8-5", "title": "Send thank-you notes to all key stakeholders", "completed": False, "due_date": None, "comments": []}
        ]
    }
]

@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    
    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@airtel.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "airtel123")
    
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        })
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Admin password updated for: {admin_email}")
    
    # Seed default weeks if none exist
    weeks_count = await db.weeks.count_documents({})
    if weeks_count == 0:
        await db.weeks.insert_many(DEFAULT_WEEKS)
        logger.info("Default weeks seeded")
    
    # Write test credentials
    try:
        os.makedirs("/app/memory", exist_ok=True)
        with open("/app/memory/test_credentials.md", "w") as f:
            f.write("# Test Credentials\n\n")
            f.write("## Admin\n")
            f.write(f"- Email: {admin_email}\n")
            f.write(f"- Password: {admin_password}\n")
            f.write("- Role: admin\n\n")
            f.write("## Endpoints\n")
            f.write("- POST /api/auth/login\n")
            f.write("- POST /api/auth/logout\n")
            f.write("- GET /api/auth/me\n")
            f.write("- GET /api/users\n")
            f.write("- POST /api/users\n")
            f.write("- DELETE /api/users/:id\n")
            f.write("- GET /api/weeks\n")
            f.write("- PUT /api/weeks/:id\n")
            f.write("- POST /api/weeks/:id/tasks\n")
            f.write("- PUT /api/weeks/:id/tasks/:taskId\n")
            f.write("- DELETE /api/weeks/:id/tasks/:taskId\n")
            f.write("- POST /api/weeks/:id/tasks/:taskId/comments\n")
    except Exception as e:
        logger.error(f"Failed to write test credentials: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
