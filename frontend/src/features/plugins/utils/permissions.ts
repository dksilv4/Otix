export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'api:proxy': 'Make requests to the Otix API on your behalf.',
  'network:external': 'Connect to external services on the internet.',
  'storage:local': 'Store data locally on your device.',
  'events:subscribe': 'Listen for changes in your Otix activity.',
  'ui:settings': 'Add a settings page.',
  'ui:media.actions': 'Add buttons to media detail pages.',
  'ui:list.actions': 'Add controls to your lists.',
  'ui:nav.item': 'Add an item to the navigation sidebar.',
  'ui:dashboard.widget': 'Add a widget to your dashboard.',
  notifications: 'Send you desktop notifications.',
  'ui:command': 'Register commands in the command palette (Cmd+K).',
}

export const getPermissionDescription = (permission: string): string => {
  if (permission.startsWith('table:')) {
    const tableName = permission.slice('table:'.length)
    return `Access the "${tableName}" database table.`
  }
  return PERMISSION_DESCRIPTIONS[permission] ?? `Requested permission: "${permission}"`
}
