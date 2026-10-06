import type { RequestInstance } from '../components/organisms/plugin-detail-actions'

export const requestableInstances = (instances: RequestInstance[]): RequestInstance[] => {
  return instances.filter((item) => item.status === 'not_exists' || item.status === 'error')
}
