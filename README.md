# Updated Grocery Site (sample)

This is a small sample project that loads provided CSV data and provides a simple Express backend with a chat-like recipe suggestion API. It uses only the attached CSV files under `backend/data`.

Run (PowerShell)

1. Backend

```
cd 'd:/Projects/Updated Grocery Site/backend'
npm install
npm run dev
```

This will start the backend on http://localhost:3333

APIs
- GET /api/products
- GET /api/recipes
- POST /api/chat { message }

The frontend is not scaffolded in this commit; you can use any static app to call the APIs.
