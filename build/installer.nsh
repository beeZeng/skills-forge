; Close running Nexus before overwrite install (program files only; userData kept).
!macro customInit
  nsExec::ExecToLog 'taskkill /F /IM "Nexus.exe" /T'
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /IM "Nexus.exe" /T'
!macroend
