// ── Company feature barrel ────────────────────────

export { createCompanyRoutes } from './router'
export { CompanyDetailPage } from './pages/company-detail-page'

export {
  companyQueries,
  companyKeys,
  useFollowCompany,
  useUnfollowCompany,
  useRateCompany,
  useUnrateCompany,
} from './queries/company-queries'

export type { CompanyDetail, CompanyFollowResponse } from './types'
