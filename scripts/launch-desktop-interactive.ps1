param(
    [switch]$Dev,
    [switch]$Packaged
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class InteractiveDesktopLauncher {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public Int32 cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public Int32 dwX;
        public Int32 dwY;
        public Int32 dwXSize;
        public Int32 dwYSize;
        public Int32 dwXCountChars;
        public Int32 dwYCountChars;
        public Int32 dwFillAttribute;
        public Int32 dwFlags;
        public Int16 wShowWindow;
        public Int16 cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public Int32 dwProcessId;
        public Int32 dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern bool CreateProcess(
        string lpApplicationName,
        string lpCommandLine,
        IntPtr lpProcessAttributes,
        IntPtr lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        IntPtr lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    public static int LaunchOnInteractiveDesktop(string commandLine, string workingDir) {
        STARTUPINFO si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(si);
        si.lpDesktop = @"WinSta0\Default";

        PROCESS_INFORMATION pi = new PROCESS_INFORMATION();

        bool success = CreateProcess(
            null,
            commandLine,
            IntPtr.Zero,
            IntPtr.Zero,
            false,
            0,
            IntPtr.Zero,
            workingDir,
            ref si,
            out pi);

        if (!success) {
            int err = Marshal.GetLastWin32Error();
            throw new System.ComponentModel.Win32Exception(err);
        }

        return pi.dwProcessId;
    }
}
"@

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packagedExe = Join-Path $root "desktop\release\win-unpacked\Otix.exe"

if ($Packaged -or ((-not $Dev) -and (Test-Path $packagedExe))) {
    Write-Host "Launching packaged Otix on WinSta0\Default ($packagedExe)..."
    $pidResult = [InteractiveDesktopLauncher]::LaunchOnInteractiveDesktop("`"$packagedExe`"", $root)
    Write-Host "Launched Otix Desktop PID: $pidResult"
} else {
    Write-Host "Launching dev Otix on WinSta0\Default..."
    $cmd = "cmd.exe /c npm --prefix desktop run dev"
    $pidResult = [InteractiveDesktopLauncher]::LaunchOnInteractiveDesktop($cmd, $root)
    Write-Host "Launched Otix Desktop (Dev) PID: $pidResult"
}
