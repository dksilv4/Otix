// TODO: Review this file
import { useCallback, useEffect, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChatSearchInput } from '../molecules/chat-search-input'
import { AlertCircle, Brain, Loader2, MessageSquare, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AiModelStatus } from '@/lib/desktop/api'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface SearchRouteParams {
  q: string
  type: string
  sort: string
}

export function SearchPage() {
  const { q } = useSearch({ from: '/search' }) as SearchRouteParams
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isAiResponding, setIsAiResponding] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiModelStatus>('not_available')
  const [aiAvailable, setAiAvailable] = useState(false)
  const [aiDownloadProgress, setAiDownloadProgress] = useState<number | null>(null)
  const [aiLoadingProgress, setAiLoadingProgress] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const api = window.desktopAPI
    if (!api?.aiGetStatus) return

    setAiAvailable(true)
    api.aiGetStatus().then(setAiStatus)
    api.aiGetDownloadProgress().then(setAiDownloadProgress)
    api.aiGetLoadingProgress().then(setAiLoadingProgress)

    const cleanups: (() => void)[] = []
    const u1 = api.onAiStatusChanged?.((s) => {
      setAiStatus(s)
      if (s !== 'loading') setAiLoadingProgress(null)
      if (s !== 'downloading') setAiDownloadProgress(null)
    })
    if (u1) cleanups.push(u1)
    const u2 = api.onAiDownloadProgress?.((p) => setAiDownloadProgress(p))
    if (u2) cleanups.push(u2)
    const u3 = api.onAiLoadingProgress?.((p) => setAiLoadingProgress(p))
    if (u3) cleanups.push(u3)
    return () => cleanups.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAiResponding])

  useEffect(() => {
    if (q && input === '' && messages.length === 0) {
      setInput(q)
      handleSend(q)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setIsAiResponding(true)

      if (!aiAvailable) {
        setTimeout(() => {
          const noteMsg: ChatMessage = {
            id: `note-${Date.now()}`,
            role: 'assistant',
            content:
              'To use AI chat, download the Otix desktop app and enable the AI addon in Settings → Intelligence.',
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, noteMsg])
          setIsAiResponding(false)
        }, 500)
        return
      }

      try {
        const api = window.desktopAPI
        if (!api) return

        const context = [
          ...messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' as const : 'user' as const,
            content: m.content,
          })),
          { role: 'user' as const, content: trimmed },
        ]

        const response = await api.aiChat(context)

        if (response) {
          const aiMsg: ChatMessage = {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: response,
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, aiMsg])
        } else {
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: aiStatus === 'not_available'
              ? 'No AI model downloaded. Go to Settings → Intelligence to download one.'
              : aiStatus === 'loading'
                ? 'Model is still loading. Please wait a moment and try again.'
                : aiStatus === 'error'
                  ? 'Model failed to load. Go to Settings → Intelligence to check the status.'
                  : 'Sorry, I could not generate a response. Try again in a moment.',
            timestamp: Date.now(),
          }
          setMessages((prev) => [...prev, errorMsg])
        }
      } catch {
        const failMsg: ChatMessage = {
          id: `fail-${Date.now()}`,
          role: 'assistant',
          content: 'An error occurred while contacting the AI model. Check Settings → Intelligence.',
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, failMsg])
      } finally {
        setIsAiResponding(false)
      }
    },
    [messages, aiAvailable],
  )

  const handleSubmit = useCallback(() => {
    handleSend(input)
  }, [handleSend, input])

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="relative flex flex-col" style={{ minHeight: 'calc(100vh - 5rem)' }}>
      <Helmet>
        <title>AI Chat - Otix</title>
        <meta name="description" content="Chat with Otix AI — your local on-device assistant for media discovery." />
      </Helmet>

      <div className="flex flex-col items-center w-full flex-1">
        {messages.length === 0 && !isAiResponding ? (
          /* ── Welcome screen ── */
          <div className="flex flex-col items-center justify-center gap-4 px-4 text-center flex-1 max-w-[600px]">
            <div className="h-12 w-12 text-primary/30">
              <MessageSquare className="h-full w-full" />
            </div>
            <h1 className="text-lg font-semibold text-foreground/80">Chat with Otix AI</h1>
            <p className="text-sm text-muted-foreground/60 max-w-md">
              Ask about movies, shows, games, or anything on your mind.
              Responses run locally on your machine.
            </p>
            <div
              className={cn(
                'flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full text-xs',
                aiStatus === 'error'
                  ? 'bg-red-400/5 text-red-400/60 ring-1 ring-red-400/10 cursor-pointer hover:bg-red-400/10'
                  : aiAvailable
                    ? 'bg-emerald-400/5 text-emerald-400/60 ring-1 ring-emerald-400/10'
                    : 'bg-white/[0.03] text-muted-foreground/40 ring-1 ring-white/[0.06]',
              )}
              onClick={aiStatus === 'error' ? () => navigate({ to: '/settings', search: { section: 'intelligence' } }) : undefined}
              role={aiStatus === 'error' ? 'button' : undefined}
              tabIndex={aiStatus === 'error' ? 0 : undefined}
            >
              {aiAvailable ? (
                <>
                  {aiStatus === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {aiStatus === 'error' && <AlertCircle className="h-3 w-3" />}
                  {(aiStatus !== 'loading' && aiStatus !== 'error') && <Brain className="h-3 w-3" />}
                  {aiStatus === 'ready' && 'Model ready'}
                  {aiStatus === 'downloading' && 'Downloading model...'}
                  {aiStatus === 'loading' && (aiLoadingProgress != null ? `Loading model ${aiLoadingProgress}%` : 'Loading model...')}
                  {aiStatus === 'not_available' && 'Model not downloaded'}
                  {aiStatus === 'error' && 'Model error — click for settings'}
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" />
                  Desktop app required
                </>
              )}
            </div>
          </div>
        ) : (
          /* ── Message list ── */
          <div className="w-full flex-1 overflow-y-auto px-4 py-6" style={{ maxWidth: '800px' }}>
            {messages.map((msg) => (
              <div key={msg.id} className="mb-6 space-y-2">
                <div
                  className={cn(
                    'flex items-start gap-3',
                    msg.role === 'user' && 'flex-row-reverse',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      msg.role === 'user'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-emerald-500/20 text-emerald-400',
                    )}
                  >
                    {msg.role === 'user' ? 'U' : <Brain className="h-4 w-4" />}
                  </div>
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-2.5 text-sm leading-relaxed max-w-[80%] whitespace-pre-wrap break-words',
                      msg.role === 'user'
                        ? 'bg-primary/15 text-foreground rounded-tr-md'
                        : 'bg-white/[0.04] text-foreground/90 rounded-tl-md ring-1 ring-white/[0.04]',
                    )}
                  >
                    {msg.content}
                    <span className="block mt-1 text-[10px] text-muted-foreground/30">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isAiResponding && (
              <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground/50">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30 animate-bounce"
                      style={{ animationDelay: `${i * 0.2}s` }}
                    />
                  ))}
                </div>
                AI is thinking...
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* ── Input area ── */}
        <div className="w-full px-4 pb-6" style={{ maxWidth: '800px' }}>
          <ChatSearchInput
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder={
              aiStatus === 'ready' ? 'Ask anything...' :
              aiStatus === 'downloading' ? 'Downloading model...' :
              aiStatus === 'loading' ? 'Loading model into memory...' :
              aiStatus === 'not_available' ? 'No model downloaded' :
              aiStatus === 'error' ? 'Model failed to load' :
              'Ask anything...'
            }
            disabled={aiStatus !== 'ready'}
            debounceMs={0}
            showSubmitWhenEmpty={false}
            submitLabel="Send"
            aiStatus={aiStatus}
            aiClassifying={false}
            aiDownloadProgress={aiDownloadProgress}
            aiLoadingProgress={aiLoadingProgress}
            activeMode="discover"
            onAiStatusClick={() => navigate({ to: '/settings', search: { section: 'intelligence' } })}
          />
          {!aiAvailable && (
            <div className="flex items-center justify-center gap-2 mt-2 text-[10px] text-muted-foreground/30">
              <Sparkles className="h-3 w-3" />
              Download the desktop app and enable AI in Settings for local chat.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
