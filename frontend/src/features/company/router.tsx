import { createRoute } from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'
import { CompanyDetailPage } from '@company/pages/company-detail-page'

export function createCompanyRoutes(rootRoute: AnyRoute) {
  const companyDetailRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/company/$companyId',
    component: CompanyDetailPage,
  })

  return [companyDetailRoute]
}
