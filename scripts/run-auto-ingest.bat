@echo off
set INTRANET_URL=http://localhost:3001
cd /d "D:\Sunidhi-Intranet-Futuristic"
"C:\Program Files\nodejs\npx.cmd" tsx scripts\intel-auto-ingest.ts >> logs\auto-ingest.log 2>&1
