# Test Platform

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/anashabibnasar-code/testapp)

Separate admin and student flows with SQLite database.

## Features
- Admin page to create tests and questions: `/admin.html`
- Set test timer in minutes while creating test
- Student page to take test: `/test.html?id=TEST_ID`
- Timer countdown + auto submit when time ends
- Result and all correct answers shown only after submit
- SQLite persistence (`exam.db`)

## Run locally
1. Install Node.js 18+
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start server:
   ```bash
   npm start
   ```
4. Open:
   - `http://localhost:3000/admin.html`

## Git push
```bash
git add .
git commit -m "Build full-stack timed test platform"
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Deploy (Railway/Render)
- Create a new Web Service from your GitHub repo
- Build command: `npm install`
- Start command: `npm start`
- After deploy, use:
  - `https://your-domain/admin.html` for admin
  - `https://your-domain/test.html?id=1` for students

## Notes
- `exam.db` is local SQLite file.
- For production with many students, use PostgreSQL/MySQL.
