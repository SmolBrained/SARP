@echo off
rem One double-click: install, render the home-page globe once, then publish to Firebase (sarpulse.org).
rem First time only: you will be asked to sign in to Firebase in your browser.
cd /d "%~dp0"
call npm install || goto :fail
call npx playwright install chromium || goto :fail
call npm run frames || goto :fail
call npx --yes firebase-tools@15 login
call npm run deploy || goto :fail
echo.
echo Done. Your site is live.
pause
exit /b 0
:fail
echo.
echo Something failed. Scroll up to read the message, then tell Claude what it says.
pause
exit /b 1
