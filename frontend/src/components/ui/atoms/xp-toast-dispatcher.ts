export interface XPToast {
  id: number
  amount: number
}

let toastId = 0
export const xpListeners: Set<(toasts: XPToast[]) => void> = new Set()

export function addXPToast(amount: number) {
  const id = ++toastId
  const toast: XPToast = { id, amount }
  for (const fn of xpListeners) {
    fn([toast])
  }
  return id
}

export function showXPToast(amount: number) {
  addXPToast(amount)
}
