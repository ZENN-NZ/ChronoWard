; webview2-check.nsh — ChronoWard NSIS pre-install WebView2 check
;
; Decision 2a: Check if WebView2 is already present on the system.
; If it is, skip the download entirely. If not, the Tauri bootstrapper
; handles the download and install silently.
;
; This script is referenced from tauri.conf.json's nsis.preinstallSection.
; It runs before Tauri's own WebView2 bootstrapper logic, setting a flag
; that the bootstrapper respects.
;
; Detection method: WebView2 registers itself in the Windows registry under
; both HKLM and HKCU depending on how it was installed (machine-wide vs user).
; We check both locations.

!macro CheckWebView2AlreadyInstalled
  ; Check machine-wide WebView2 install (HKLM — typical for corporate imaging)
  ReadRegStr $0 HKLM \
    "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" \
    "pv"

  ${If} $0 != ""
    ; WebView2 found via HKLM — skip download
    DetailPrint "WebView2 already installed (machine-wide, version $0) — skipping download"
    ; Setting this registry value tells the Tauri bootstrapper to skip the install
    WriteRegStr HKCU "Software\ChronoWard\Setup" "WebView2Present" "1"
    Goto webview2_check_done
  ${EndIf}

  ; Check user-scoped WebView2 install (HKCU — typical for non-admin installs)
  ReadRegStr $1 HKCU \
    "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" \
    "pv"

  ${If} $1 != ""
    DetailPrint "WebView2 already installed (user-scoped, version $1) — skipping download"
    WriteRegStr HKCU "Software\ChronoWard\Setup" "WebView2Present" "1"
    Goto webview2_check_done
  ${EndIf}

  ; Also check the newer registry path used by WebView2 Runtime on Win11
  ReadRegStr $2 HKLM \
    "SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" \
    "pv"

  ${If} $2 != ""
    DetailPrint "WebView2 already installed (Win11 path, version $2) — skipping download"
    WriteRegStr HKCU "Software\ChronoWard\Setup" "WebView2Present" "1"
    Goto webview2_check_done
  ${EndIf}

  ; WebView2 not found — let the Tauri bootstrapper handle the download
  DetailPrint "WebView2 not found — will download bootstrapper"
  DeleteRegValue HKCU "Software\ChronoWard\Setup" "WebView2Present"

  webview2_check_done:
!macroend

; Insert the check before the main install section runs
Section "pre"
  !insertmacro CheckWebView2AlreadyInstalled
SectionEnd
