@echo off
title WorldForge
start "WorldForge Backend" cmd /k "cd /d R:\Projects\WorldForge\backend && npm run dev"
start "WorldForge Frontend" cmd /k "cd /d R:\Projects\WorldForge\frontend && npm run dev"
echo Backend: http://localhost:3001
echo Frontend: http://localhost:3000
