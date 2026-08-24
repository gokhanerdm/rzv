@echo off
title RZV Sunucu
cd /d "%~dp0"
echo RZV sunucusu baslatiliyor...
echo Bu pencereyi KAPATMA - sunucu bu pencerede calisiyor.
echo.
echo PC'de:    http://localhost:3002
node -e "const o=require('os').networkInterfaces();let v=false;for(const l of Object.values(o))for(const i of l||[])if(i.family==='IPv4'&&!i.internal){v=true;console.log('Telefonda: http://'+i.address+':3002')};if(!v)console.log('Telefonda: ag baglantisi yok')"
echo.
call npm run dev -- -p 3002 -H 0.0.0.0
pause
