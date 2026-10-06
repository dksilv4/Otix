// Simple deterministic color from entity name
export const colorFromName = (name: string): string => {
  const colors = [
    'bg-blue-500/20 text-blue-400',
    'bg-green-500/20 text-green-400',
    'bg-yellow-500/20 text-yellow-400',
    'bg-red-500/20 text-red-400',
    'bg-purple-500/20 text-purple-400',
    'bg-pink-500/20 text-pink-400',
    'bg-indigo-500/20 text-indigo-400',
    'bg-teal-500/20 text-teal-400',
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
