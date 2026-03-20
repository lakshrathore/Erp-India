@echo off
echo ========================================
echo   ERP India - Setup Script
echo ========================================
echo.

echo [1/4] Cleaning old node_modules...
if exist "node_modules" rmdir /s /q "node_modules"
if exist "apps\backend\node_modules" rmdir /s /q "apps\backend\node_modules"
if exist "apps\frontend\node_modules" rmdir /s /q "apps\frontend\node_modules"
if exist "package-lock.json" del "package-lock.json"
if exist "apps\backend\package-lock.json" del "apps\backend\package-lock.json"
if exist "apps\frontend\package-lock.json" del "apps\frontend\package-lock.json"
echo    Done!

echo.
echo [2/4] Clearing npm cache...
npm cache clean --force
echo    Done!

echo.
echo [3/4] Installing all dependencies...
npm install
echo    Done!

echo.
echo [4/4] Setup complete!
echo.
echo ==========================================
echo   Next Steps:
echo ==========================================
echo.
echo 1. Copy apps\backend\.env.example to apps\backend\.env
echo    and fill in your DATABASE_URL, JWT_SECRET etc.
echo.
echo 2. Run database migration:
echo    npm run db:push --workspace=apps/backend
echo.
echo 3. Seed database:
echo    npm run db:seed --workspace=apps/backend
echo.
echo 4. Start development server:
echo    npm run dev
echo.
echo    Backend runs on: http://localhost:5000
echo    Frontend runs on: http://localhost:5173
echo ==========================================
pause
