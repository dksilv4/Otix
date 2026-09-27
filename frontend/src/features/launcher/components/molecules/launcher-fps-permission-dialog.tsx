import { useState, useEffect } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'

export function FpsPermissionDialog() {
  const [show, setShow] = useState(false)
  const [fixing, setFixing] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const api = getDesktopAPI()
    if (!api) return
    const unsub = api.onFpsPermissionNeeded(() => setShow(true))
    return unsub
  }, [])

  const handleFix = async () => {
    const api = getDesktopAPI()
    if (!api) return
    setFixing(true)
    try {
      const result = await api.fixFpsPermissions()
      if (result.success) {
        setDone(true)
        setFixing(false)
      } else {
        setFixing(false)
      }
    } catch {
      setFixing(false)
    }
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-white/10 shadow-2xl p-6">
        {!done ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">
                O
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Otix — FPS Overlay</h2>
                <p className="text-white/40 text-xs">Real-time frame rate tracking</p>
              </div>
            </div>

            <p className="text-white/70 text-sm leading-relaxed mb-5">
              Otix needs to enable Windows Performance Tracing to capture FPS data.
              This requires adding your user to the <span className="text-cyan-300 font-mono text-xs">Performance Log Users</span> group —
              a one-time setup with no further prompts.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShow(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-medium transition-all"
              >
                Skip
              </button>
              <button
                onClick={handleFix}
                disabled={fixing}
                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {fixing ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Enable FPS'
                )}
              </button>
            </div>

            <p className="text-white/30 text-[10px] mt-3 text-center">
              Administrator access required once. UAC prompt will appear.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
                ✓
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Ready to go</h2>
                <p className="text-white/40 text-xs">FPS overlay enabled</p>
              </div>
            </div>

            <p className="text-white/70 text-sm leading-relaxed mb-5">
              You've been added to <span className="text-cyan-300 font-mono text-xs">Performance Log Users</span>.
              <span className="block mt-2 text-amber-300 font-medium">
                ⚠ Restart your PC for the change to take effect, then FPS data will appear.
              </span>
            </p>

            <button
              onClick={() => setShow(false)}
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-sm font-medium transition-all"
            >
              Got it
            </button>
          </>
        )}
      </div>
    </div>
  )
}
