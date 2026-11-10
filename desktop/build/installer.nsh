!macro customInit
  nsExec::Exec 'sc.exe stop OtixCapture'
!macroend

!macro customInstall
  DetailPrint "Configuring Otix Capture Service for zero-reboot FPS monitoring..."
  nsExec::Exec 'sc.exe create OtixCapture binPath= "$\"$INSTDIR\resources\bin\otix-node.exe$\" -capture-service" start= auto DisplayName= "Otix Capture Service"'
  nsExec::Exec 'sc.exe description OtixCapture "Background capture helper for Otix in-game performance overlay"'
  nsExec::Exec 'sc.exe failure OtixCapture reset= 86400 actions= restart/5000'
  nsExec::Exec 'sc.exe start OtixCapture'

  ReadEnvStr $0 USERNAME
  ${If} $0 != ""
    nsExec::Exec 'cmd.exe /c net localgroup "Performance Log Users" "$0" /add'
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::Exec 'sc.exe stop OtixCapture'
  nsExec::Exec 'sc.exe delete OtixCapture'
!macroend
