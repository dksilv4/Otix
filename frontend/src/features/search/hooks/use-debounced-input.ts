import { useState, useRef, useEffect, useMemo } from 'react'

const MEDIA_TYPE_REGEX = /^\/(movie|show|game|music)\s*/

export function useDebouncedInput(
  value: string,
  onChange: (val: string) => void,
  debounceMs = 300,
) {
  const [inputValue, setInputValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value !== inputValue) {
      const tagMatch = inputValue.match(MEDIA_TYPE_REGEX)
      const prefix = tagMatch ? tagMatch[0] : ''
      if (!inputValue.startsWith(prefix)) {
        setInputValue(value)
      }
    }
  }, [value])

  const parsedType = useMemo(() => {
    const match = inputValue.match(MEDIA_TYPE_REGEX)
    return match ? match[1] as 'movie' | 'show' | 'game' | 'music' | null : null
  }, [inputValue])

  const displayValue = inputValue.replace(MEDIA_TYPE_REGEX, '')

  const handleChange = (val: string) => {
    setInputValue(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const stripped = val.replace(MEDIA_TYPE_REGEX, '')
      onChange(stripped)
    }, debounceMs)
  }

  const handleClear = () => {
    setInputValue('')
    if (timerRef.current) clearTimeout(timerRef.current)
    onChange('')
  }

  const removeTypeTag = () => {
    const stripped = inputValue.replace(MEDIA_TYPE_REGEX, '')
    setInputValue(stripped)
    if (timerRef.current) clearTimeout(timerRef.current)
    onChange(stripped)
  }

  return { inputValue, setInputValue, parsedType, displayValue, handleChange, handleClear, removeTypeTag }
}
