export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const getMonthGrid = (year: number, month: number): (number | null)[] => {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const grid: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) grid.push(null)
  for (let d = 1; d <= daysInMonth; d++) grid.push(d)
  // Pad to complete the last week
  while (grid.length % 7 !== 0) grid.push(null)
  return grid
}
