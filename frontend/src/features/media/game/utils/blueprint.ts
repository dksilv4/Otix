// Simple deterministic color from entity name
export const colorFromName = (name: string): string => {
  const colors = [
    'bg-blue-500/15 text-blue-700 dark:text-blue-300',
    'bg-green-500/15 text-green-700 dark:text-green-300',
    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    'bg-red-500/15 text-red-700 dark:text-red-300',
    'bg-purple-500/15 text-purple-700 dark:text-purple-300',
    'bg-pink-500/15 text-pink-700 dark:text-pink-300',
    'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
    'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i)
  }
  return colors[Math.abs(hash) % colors.length]
}

export const iconInitial = (name: string): string => {
  return name.split(/[-\s]/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// Group entities by category based on name patterns
export const categorizeEntity = (name: string): string => {
  if (name.includes('assembling') || name.includes('furnace') || name.includes('chemical') || name.includes('refinery'))
    return 'Production'
  if (name.includes('belt') || name.includes('splitter') || name.includes('underground') || name.includes('loader'))
    return 'Logistics (Belts)'
  if (name.includes('inserter'))
    return 'Logistics (Inserters)'
  if (name.includes('train') || name.includes('rail') || name.includes('signal') || name.includes('station'))
    return 'Rail'
  if (name.includes('pole') || name.includes('substation') || name.includes('accumulator') || name.includes('solar') || name.includes('reactor'))
    return 'Power'
  if (name.includes('pipe') || name.includes('pump') || name.includes('tank') || name.includes('offshore'))
    return 'Fluids'
  if (name.includes('chest') || name.includes('logistic') || name.includes('requester') || name.includes('provider') || name.includes('storage'))
    return 'Logistics (Chests)'
  if (name.includes('drill') || name.includes('mining'))
    return 'Mining'
  if (name.includes('module') || name.includes('beacon'))
    return 'Modules'
  if (name.includes('wall') || name.includes('gun') || name.includes('laser') || name.includes('ammo') || name.includes('radar'))
    return 'Military'
  return 'Other'
}
