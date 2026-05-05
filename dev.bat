@echo off
start "SSH Tunnel" ssh -L 5432:localhost:5432 root@139.84.199.217 -N
start "Backend" cmd /k "cd /d %~dp0backend && npm run dev"
start "Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
