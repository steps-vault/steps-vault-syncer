; Registers the dancedance-sync:// link scheme for the current user, so the website's "Open in Sync app" opens the app
; even before it first runs (the app registers it again at every start). Keep the scheme in step with
; SYNC_LINK_SCHEME in src/main/sync-link.ts.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\dancedance-sync" "" "URL:DanceDance Sync"
  WriteRegStr SHELL_CONTEXT "Software\Classes\dancedance-sync" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\dancedance-sync\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\dancedance-sync\shell\open\command" "" '"$appExe" "%1"'
!macroend

; An update runs the old uninstaller first; the scheme stays then, and goes only when the player really uninstalls.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegKey SHELL_CONTEXT "Software\Classes\dancedance-sync"
  ${endIf}
!macroend
