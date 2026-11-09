@echo off
REM Mo cong 3000 tren Windows Firewall de dien thoai cung Wi-Fi vao duoc.
REM Bam chuot phai file nay > "Run as administrator".
netsh advfirewall firewall delete rule name="Phone Party Arcade" >nul 2>&1
netsh advfirewall firewall add rule name="Phone Party Arcade" dir=in action=allow protocol=TCP localport=3000 profile=any
if %errorlevel%==0 (echo Xong! Da mo cong 3000.) else (echo Loi: hay chay bang quyen Administrator.)
pause
