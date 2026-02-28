@echo off
setlocal

set INPUT_ZIP=bank_statement\statement_28022026_0063.zip
set OUTPUT_TS=data\2026.ts
rem set DRY_RUN=1

cmd /c "set INPUT_ZIP=%INPUT_ZIP%&& set OUTPUT_TS=%OUTPUT_TS%&& tsx .\src\convertStatementZip.ts"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" exit /b %EXIT_CODE%

echo Done: "%OUTPUT_TS%"
endlocal
