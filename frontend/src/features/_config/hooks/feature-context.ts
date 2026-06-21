import { createContext } from 'react'
import type { FeatureOverrides } from '../types'

export const FeatureContext = createContext<FeatureOverrides>({})
