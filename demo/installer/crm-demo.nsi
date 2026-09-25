!include "MUI2.nsh"

!ifndef APP_VERSION
!define APP_VERSION "0.1.0"
!endif
!define APP_NAME "CRM Demo"
!define APP_PUBLISHER "jarbcs1-prog"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CRMDemo"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "dist\CRMDemo-Setup-${APP_VERSION}.exe"
InstallDir "$LOCALAPPDATA\CRMDemo"
RequestExecutionLevel user
ShowInstDetails hide

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "English"

Section "Application" SEC_APP
  SetOutPath "$INSTDIR"
  File /r "staging\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME} ${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\CRM Demo"
  SetOutPath "$INSTDIR"
  CreateShortcut "$SMPROGRAMS\CRM Demo\Start CRM Demo.lnk" "$INSTDIR\Start-CRM-Demo.bat"
  CreateShortcut "$SMPROGRAMS\CRM Demo\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\CRM Demo\Start CRM Demo.lnk"
  Delete "$SMPROGRAMS\CRM Demo\Uninstall.lnk"
  RMDir "$SMPROGRAMS\CRM Demo"
  Delete "$INSTDIR\server.mjs"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\SETUP.md"
  Delete "$INSTDIR\AGENT-PROMPTS.md"
  Delete "$INSTDIR\Start-CRM-Demo.bat"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir /r "$INSTDIR\public"
  RMDir /r "$INSTDIR\pitches"
  RMDir /r "$INSTDIR\node"
  DeleteRegKey HKCU "${UNINST_KEY}"
  RMDir "$INSTDIR"
SectionEnd
