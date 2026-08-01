import { useState } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import './preferences.scss'

export function PreferencesSection() {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [showAdultContent, setShowAdultContent] = useState(user?.showAdultContent ?? false)

  const userAge = (() => {
    if (!user?.dateOfBirth) return null
    const dob = new Date(user.dateOfBirth)
    if (isNaN(dob.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const m = today.getMonth() - dob.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
    return age
  })()
  const isAdult = userAge !== null && userAge >= 18

  return (
    <div className="dk-settings-preferences__body">
      <div>
        <h2 className="dk-settings-preferences__title">Content Preferences</h2>
        <p className="dk-settings-preferences__desc">
          Manage your content filtering and maturity settings.
        </p>
      </div>

      {isAdult ? (
        <div className="dk-settings-preferences__card">
          <div className="dk-settings-preferences__row">
            <div>
              <p className="dk-settings-preferences__row-label">Show 18+ Content</p>
              <p className="dk-settings-preferences__row-desc">
                Include adult-rated media in search results and recommendations.
              </p>
            </div>
            <DkSwitch
              checked={showAdultContent}
              onCheckedChange={async (checked: boolean) => {
                setShowAdultContent(checked)
                try {
                  await apiClient.patch('/auth/me', { show_adult_content: checked })
                  await refreshUser()
                  await queryClient.invalidateQueries({ queryKey: ['discover'] })
                } catch { setShowAdultContent(!checked) }
              }}
            />
          </div>
        </div>
      ) : (
        <div className="dk-settings-preferences__card">
          <p className="dk-settings-preferences__row-desc">
            Sign in with a date of birth to configure content maturity settings.
          </p>
        </div>
      )}
    </div>
  )
}
