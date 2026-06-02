import { useState } from "react"
import { AlertTriangle, Lock } from "lucide-react"
import { DkButton } from "@/features/dk-ui/atoms/button"
import { DkInput } from "@/features/dk-ui/atoms/input"
import { DkCheckbox } from "@/features/dk-ui/atoms/checkbox"
import { StarInput } from "./star-input"
import { useUpsertReview, useDeleteReview, type ReviewOut } from "../review-queries"
import { cn } from "@/lib/utils"

function isPastCooldown(cooldownUntil: string | null): boolean {
 if (!cooldownUntil) return true
 return new Date(cooldownUntil) <= new Date()
}

interface ReviewComposerProps {
 mediaId: string
 existingReview?: ReviewOut | null
 onClose: () => void
 onSaved?: () => void
}

function ReviewComposer({ mediaId, existingReview, onClose, onSaved }: ReviewComposerProps) {
 const [score, setScore] = useState<number>(existingReview?.score ?? 0)
 const [title, setTitle] = useState(existingReview?.title ?? "")
 const [content, setContent] = useState(existingReview?.content ?? "")
 const [isSpoiler, setIsSpoiler] = useState(existingReview?.isSpoiler ?? false)
 const [isPrivate, setIsPrivate] = useState(existingReview?.isPrivate ?? false)
 const [error, setError] = useState<string | null>(null)

 const upsert = useUpsertReview(mediaId)
 const deleteReview = useDeleteReview(mediaId)

 const reviewLocked = existingReview ? isPastCooldown(existingReview.cooldownUntil) : false

 const trimmedContent = content.trim()
 const hasRating = score > 0
 const hasReviewText = trimmedContent.length >= 10
 const hasShortReviewText = trimmedContent.length > 0 && !hasReviewText
 const canSave = hasRating || hasReviewText
 const charCount = content.length
 const isSaving = upsert.isPending
 const isDeleting = deleteReview.isPending

 const handleSave = async () => {
 if (!canSave) {
 setError(hasShortReviewText ? "Review text must be at least 10 characters." : "Add a rating or write a review.")
 return
 }
 setError(null)
 try {
 await upsert.mutateAsync({
 score: score > 0 ? score : null,
 title: title.trim() || null,
 content: trimmedContent || null,
 isSpoiler,
 isPrivate,
 })
 onSaved?.()
 onClose()
 } catch {
 setError("Failed to save review. Please try again.")
 }
 }

 const handleDelete = async () => {
 setError(null)
 try {
 await deleteReview.mutateAsync()
 onSaved?.()
 onClose()
 } catch {
 setError("Failed to delete review. Please try again.")
 }
 }

 return (
 <div className="flex flex-col gap-5">
 {/* Star rating */}
 <div className="flex flex-col items-center gap-1">
 <StarInput value={score || null} onChange={setScore} size="lg" />
 <p className="text-[11px] text-muted-foreground">
 {score > 0 ? `${score}/10` : "Tap a star to rate"}
 </p>
 </div>

 {/* Title */}
 <DkInput
 placeholder="Review title (optional)"
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 maxLength={200}
 disabled={isSaving || reviewLocked}
 />

 {/* Content */}
 <div className="relative">
 <textarea
 className={cn(
 "w-full min-h-[140px] rounded-2xl bg-[var(--dk-surface-field)] px-4 py-3",
 "text-sm placeholder:text-muted-foreground/50",
 "focus-visible:outline-none focus-visible:border-[var(--dk-border-accent)] focus-visible:ring-1 focus-visible:ring-[var(--dk-border-accent)]",
 "resize-y transition-colors",
 "disabled:cursor-not-allowed disabled:opacity-50",
 )}
 placeholder="Share your thoughts..."
 value={content}
 onChange={(e) => setContent(e.target.value)}
 maxLength={5000}
 disabled={isSaving || reviewLocked}
 />
 <span
 className={cn(
 "absolute bottom-2.5 right-3 text-[11px] tabular-nums",
 charCount > 4500 ? "text-amber-500" : "text-muted-foreground/40",
 charCount > 4900 && "text-destructive",
 )}
 >
 {charCount}/5000
 </span>
 </div>

 {/* Spoiler toggle */}
 <label className={cn("flex items-center gap-2.5 select-none group", reviewLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
 <DkCheckbox
 checked={isSpoiler}
 onCheckedChange={(v) => setIsSpoiler(!!v)}
 disabled={isSaving || reviewLocked}
 />
 <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
 Contains spoilers
 </span>
 </label>

 {/* Privacy toggle */}
 <label className={cn("flex items-center gap-2.5 select-none group", reviewLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
 <DkCheckbox
 checked={isPrivate}
 onCheckedChange={(v) => setIsPrivate(!!v)}
 disabled={isSaving || reviewLocked}
 />
 <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
 Make this review private
 </span>
 </label>

 {/* Cooldown lock notice */}
 {reviewLocked && (
 <div className="flex items-center gap-2 rounded-2xl bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
 <Lock className="w-4 h-4 shrink-0" />
 Review text is locked. You can still update your rating or delete this review.
 </div>
 )}

 {/* Error */}
 {error && (
 <div className="flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
 <AlertTriangle className="w-4 h-4 shrink-0" />
 {error}
 </div>
 )}

 {/* Actions */}
 <div className="flex items-center gap-3 pt-1">
 <DkButton
 onClick={handleSave}
 disabled={!canSave || isSaving || isDeleting}
 className="flex-1"
 variant="primary"
 >
 {isSaving ? "Saving..." : existingReview ? (reviewLocked ? "Update Rating" : "Update Review") : "Submit Review"}
 </DkButton>
 {existingReview && (
 <DkButton
 onClick={handleDelete}
 disabled={isDeleting || isSaving}
 variant="destructive"
 >
 {isDeleting ? "Deleting..." : "Delete"}
 </DkButton>
 )}
 </div>
 </div>
 )
}

export { ReviewComposer }
