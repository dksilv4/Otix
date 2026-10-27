// TODO: Review this file
import { useState } from "react"
import { AlertTriangle, Lock } from "lucide-react"
import { DkButton } from "@ui/atoms/button"
import { DkInput } from "@ui/atoms/input"
import { DkCheckbox } from "@ui/atoms/checkbox"
import { StarInput } from "./star-input"
import { cn } from "@/lib/utils"
import { useUpsertReview, useDeleteReview, type ReviewOut } from "../review-queries"
import "./review-composer.scss"
import { useUpsertRating, useDeleteRating, type MediaRatingOut } from "../rating-queries"
import { isPastCooldown } from "../utils"

interface ReviewComposerProps {
 mediaType: string
 mediaId: string
 existingReview?: ReviewOut | null
 existingRating?: MediaRatingOut | null
 onClose: () => void
 onSaved?: () => void
}

const ReviewComposer = ({ mediaType, mediaId, existingReview, existingRating, onClose, onSaved }: ReviewComposerProps) => {
 const [score, setScore] = useState<number>(existingRating?.score ?? 0)
 const [title, setTitle] = useState(existingReview?.title ?? "")
 const [content, setContent] = useState(existingReview?.content ?? "")
 const [isSpoiler, setIsSpoiler] = useState(existingReview?.isSpoiler ?? false)
 const [isPrivate, setIsPrivate] = useState(existingReview?.isPrivate ?? false)
 const [error, setError] = useState<string | null>(null)

 const upsertReview = useUpsertReview(mediaType, mediaId)
 const deleteReview = useDeleteReview(mediaType, mediaId)
 const upsertRating = useUpsertRating(mediaType, mediaId)
 const deleteRating = useDeleteRating(mediaType, mediaId)

 const reviewLocked = existingReview ? isPastCooldown(existingReview.cooldownUntil) : false

 const trimmedContent = content.trim()
 const hasRating = score > 0
 const hasReviewText = trimmedContent.length >= 10
 const hasShortReviewText = trimmedContent.length > 0 && !hasReviewText
 const canSave = hasRating || hasReviewText
 const charCount = content.length
 const isSaving = upsertReview.isPending || upsertRating.isPending
 const isDeleting = deleteReview.isPending || deleteRating.isPending

 const handleSave = async () => {
   if (!canSave) {
     setError(hasShortReviewText ? "Review text must be at least 10 characters." : "Add a rating or write a review.")
     return
   }
   setError(null)
   try {
     // Save rating if score is set
     if (hasRating) {
       await upsertRating.mutateAsync(score)
     }

     // Save review if content is provided
     if (hasReviewText) {
       await upsertReview.mutateAsync({
         title: title.trim() || null,
         content: trimmedContent || null,
         isSpoiler,
         isPrivate,
       })
     }

     onSaved?.()
     onClose()
   } catch {
     setError("Failed to save. Please try again.")
   }
 }

 const handleDelete = async () => {
   setError(null)
   try {
     await Promise.all([
       existingRating ? deleteRating.mutateAsync() : Promise.resolve(),
       existingReview ? deleteReview.mutateAsync() : Promise.resolve(),
     ])
     onSaved?.()
     onClose()
   } catch {
     setError("Failed to delete. Please try again.")
   }
 }

 return (
   <div className="dk-review-composer">
     {/* Star rating â€” always free to change */}
     <div className="dk-review-composer__rating">
       <StarInput value={score || null} onChange={setScore} size="lg" />
       <p className="dk-review-composer__rating-caption">
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
     <div className="dk-review-composer__content-wrapper">
       <textarea
         className="dk-review-composer__textarea"
         placeholder="Share your thoughts..."
         value={content}
         onChange={(e) => setContent(e.target.value)}
         maxLength={5000}
         disabled={isSaving || reviewLocked}
       />
       <span
         className={cn(
           "dk-review-composer__char-count",
           charCount > 4500 && "dk-review-composer__char-count--warning",
           charCount > 4900 && "dk-review-composer__char-count--danger",
         )}
       >
         {charCount}/5000
       </span>
     </div>

     {/* Spoiler & Privacy toggles using standard DkCheckbox */}
     <div className="flex flex-col gap-2.5">
       <DkCheckbox
         label="Contains spoilers"
         checked={isSpoiler}
         onCheckedChange={(v) => setIsSpoiler(!!v)}
         disabled={isSaving || reviewLocked}
       />
       <DkCheckbox
         label="Make this review private"
         checked={isPrivate}
         onCheckedChange={(v) => setIsPrivate(!!v)}
         disabled={isSaving || reviewLocked}
       />
     </div>

     {/* Cooldown lock notice â€” only for review text */}
     {reviewLocked && (
       <div className="dk-review-composer__notice dk-review-composer__notice--lock">
         <Lock className="w-4 h-4 shrink-0" />
         Review text is locked. You can still update your rating or delete.
       </div>
     )}

     {/* Error */}
     {error && (
       <div className="dk-review-composer__notice dk-review-composer__notice--error">
         <AlertTriangle className="w-4 h-4 shrink-0" />
         {error}
       </div>
     )}

     {/* Actions */}
     <div className="dk-review-composer__actions">
       <DkButton
         onClick={handleSave}
         disabled={!canSave || isSaving || isDeleting}
         className="flex-1"
         variant="primary"
       >
         {isSaving ? "Saving..." : (existingReview || existingRating) ? "Update" : "Save"}
       </DkButton>
       {(existingReview || existingRating) && (
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
};

export { ReviewComposer }
