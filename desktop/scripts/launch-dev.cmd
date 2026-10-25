@echo off
set "PATH=C:\Users\diogo\.nodejs\node-v22.14.0-win-x64;C:\Users\diogo\.python;C:\Users\diogo\AppData\Local\GitHubDesktop\app-3.6.9\resources\app\git\cmd;%PATH%"
set "NODE_ENV=development"
cd /d "%~dp0\.."
start "" "%~dp0\..\node_modules\electron\dist\electron.exe" "%~dp0\.." --remote-debugging-port=9222
