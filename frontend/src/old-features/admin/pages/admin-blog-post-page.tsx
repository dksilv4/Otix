// TODO: Review this file
import { Link, useParams } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { ArrowLeft, Calendar } from 'lucide-react'
import { DkBadge } from '@/old-features/ui/atoms/badge'
import { ADMIN_BLOG_POSTS } from '../admin-blog.types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }

function isBlockStart(line: string): boolean {
  return (
    line.startsWith('## ') ||
    line.startsWith('### ') ||
    /^\s*-\s/.test(line) ||
    /^\d+\.\s/.test(line)
  )
}

function parseBody(body: string): Block[] {
  const lines = body.split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // skip empty lines
    if (line.trim() === '') {
      i++
      continue
    }

    // h2 heading
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      blocks.push({ kind: 'h2', text: line.slice(3) })
      i++
      continue
    }

    // h3 heading
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: line.slice(4) })
      i++
      continue
    }

    // unordered list (consecutive)
    if (/^\s*-\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s*/, ''))
        i++
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    // ordered list (consecutive)
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    // paragraph: consume until blank line or next block element
    const paraLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: 'p', text: paraLines.join(' ') })
    }
  }

  return blocks
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = []
  // Split on **bold** and `code` patterns
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    // text before this match
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    if (match[2] !== undefined) {
      // **bold**
      parts.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      // `code`
      parts.push(
        <code key={key++} className="dk-admin-blog-post__code">
          {match[3]}
        </code>,
      )
    }
    last = match.index + match[0].length
  }

  // remaining text
  if (last < text.length) {
    parts.push(text.slice(last))
  }

  return parts.length > 0 ? parts : text
}

function renderBlock(block: Block, key: number) {
  switch (block.kind) {
    case 'h2':
      return (
        <h2 key={key} className="dk-admin-blog-post__heading--2">
          {renderInline(block.text)}
        </h2>
      )
    case 'h3':
      return (
        <h3 key={key} className="dk-admin-blog-post__heading--3">
          {renderInline(block.text)}
        </h3>
      )
    case 'ul':
      return (
        <ul key={key} className="dk-admin-blog-post__list--unordered">
          {block.items.map((item, j) => (
            <li key={j}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key} className="dk-admin-blog-post__list--ordered">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      )
    case 'p':
      return (
        <p key={key} className="dk-admin-blog-post__paragraph">
          {renderInline(block.text)}
        </p>
      )
  }
}

function renderBody(body: string) {
  return parseBody(body).map((block, i) => renderBlock(block, i))
}

export function AdminBlogPostPage() {
  const { slug } = useParams({ strict: false }) as { slug?: string }
  const post = ADMIN_BLOG_POSTS.find((p) => p.slug === slug)

  if (!post) {
    return (
      <div className="dk-admin-blog-post">
        <Helmet>
          <title>Not Found - Admin - Otix</title>
        </Helmet>
        <Link
          to="/admin"
          className="dk-admin-blog-post__back-link"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
        <h1 className="dk-admin-blog-post__not-found-title">Post not found</h1>
        <p className="dk-admin-blog-post__not-found-message">
          The blog post "{slug}" does not exist.
        </p>
      </div>
    )
  }

  return (
    <div className="dk-admin-blog-post">
      <Helmet>
        <title>{post.title} - Admin - Otix</title>
      </Helmet>

      <Link
        to="/admin"
        className="dk-admin-blog-post__back-link"
      >
        <ArrowLeft className="h-4 w-4" />
        Admin
      </Link>

      <h1 className="dk-admin-blog-post__title">{post.title}</h1>

      <div className="dk-admin-blog-post__meta">
        <span className="dk-admin-blog-post__meta-date">
          <Calendar className="h-3 w-3" />
          {formatDate(post.date)}
        </span>
        <span className="dk-admin-blog-post__meta-author">by {post.author}</span>
        {post.tags.map((tag) => (
          <DkBadge key={tag} variant="muted" size="sm">
            {tag}
          </DkBadge>
        ))}
      </div>

      <div className="dk-admin-blog-post__content">
        {renderBody(post.body)}
      </div>
    </div>
  )
}
