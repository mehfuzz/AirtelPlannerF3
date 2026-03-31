# Airtel PPO Tracker - Backend

## Deployment on Render

### Environment Variables Required:
```
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
DB_NAME=airtel_ppo_tracker
JWT_SECRET=<generate-a-strong-secret-key>
CORS_ORIGINS=https://your-frontend-domain.vercel.app
ADMIN_EMAIL=admin@airtel.com
ADMIN_PASSWORD=<your-secure-password>
```

### Build Command:
```
pip install -r requirements.txt
```

### Start Command:
```
uvicorn server:app --host 0.0.0.0 --port $PORT
```
