# Airtel 8-Week PPO Tracker

A comprehensive internship progress tracker for Airtel SCM Digital Transformation.

## Features
- 8-week task tracker with editable content
- Drag & drop task reordering
- Calendar view for due dates
- Comments on tasks
- Export to PDF and Excel
- User management (admin)
- Email/password authentication

## Tech Stack
- **Frontend**: React 19, Tailwind CSS, Shadcn UI
- **Backend**: FastAPI, Python
- **Database**: MongoDB

## Deployment

### Option 1: Free Tier Deployment

#### 1. MongoDB Atlas (Database)
1. Go to [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create a free account
3. Create a new cluster (M0 Free Tier)
4. Create a database user with password
5. Whitelist IP: `0.0.0.0/0` (allow all for Render)
6. Get connection string: `mongodb+srv://username:password@cluster.mongodb.net/airtel_ppo_tracker`

#### 2. Render (Backend)
1. Go to [render.com](https://render.com)
2. Connect your GitHub repository
3. Create a new "Web Service"
4. Select the repository and set:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn server:app --host 0.0.0.0 --port $PORT`
5. Add Environment Variables:
   ```
   MONGO_URL=<your-mongodb-atlas-connection-string>
   DB_NAME=airtel_ppo_tracker
   JWT_SECRET=<generate-strong-secret>
   CORS_ORIGINS=https://your-app.vercel.app
   ADMIN_EMAIL=admin@airtel.com
   ADMIN_PASSWORD=<secure-password>
   ```
6. Deploy

#### 3. Vercel (Frontend)
1. Go to [vercel.com](https://vercel.com)
2. Import your GitHub repository
3. Set:
   - **Root Directory**: `frontend`
   - **Build Command**: `yarn build`
   - **Output Directory**: `build`
4. Add Environment Variable:
   ```
   REACT_APP_BACKEND_URL=https://your-backend.onrender.com
   ```
5. Deploy

### Default Admin Credentials
- Email: admin@airtel.com
- Password: (set in ADMIN_PASSWORD env var)

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8001

# Frontend
cd frontend
yarn install
yarn start
```

## License
Private - Airtel Internship Project
