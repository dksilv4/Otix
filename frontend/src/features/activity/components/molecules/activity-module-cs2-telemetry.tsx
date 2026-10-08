import type { Cs2LiveState } from '@/lib/desktop/api'
import { cs2ToUniversalTelemetry } from '../../utils/telemetry-adapter'
import { ActivityModuleLiveTelemetry } from './activity-module-live-telemetry'

interface ActivityModuleCs2TelemetryProps {
  state: Cs2LiveState
}

/**
 * Molecule rendering live in-match telemetry for Counter-Strike 2.
 * Powered by Otix Universal Game Telemetry.
 */
export const ActivityModuleCs2Telemetry = ({ state }: ActivityModuleCs2TelemetryProps) => {
  const universal = cs2ToUniversalTelemetry(state)
  if (!universal) return null

  return <ActivityModuleLiveTelemetry telemetry={universal} />
}
