cls

set filename="preConverted.ts"
IF EXIST %filename% del %filename%

echo type operation = [string, string, string, string, string^|undefined, string, string, string^|number, number^|string^|undefined, string^|number^|undefined, string] >> %filename%
echo let data:operation[];>> %filename%
echo: >> %filename%
echo export default data = [>> %filename%

FOR /F "tokens=*" %%i IN (statement.ts) DO @ECHO [%%i], >> %filename%
echo ] >> %filename%

tsx ./src/convert.ts