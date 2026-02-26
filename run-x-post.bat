@echo off
chcp 65001 > nul
cd /d "C:\Users\aakis\OneDrive\デスクトップ\antigravity"
if not exist "C:\Users\aakis\OneDrive\デスクトップ\antigravity\logs" mkdir "C:\Users\aakis\OneDrive\デスクトップ\antigravity\logs"
"C:\Program Files\nodejs\node.exe" "C:\Users\aakis\OneDrive\デスクトップ\antigravity\scripts\post-to-x.js" --single --delay >> "C:\Users\aakis\OneDrive\デスクトップ\antigravity\logs\x-scheduler.log" 2>&1
