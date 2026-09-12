// TODO: Review this file
import "./review-section.scss"
import { useQuery } from "@tanstack/react-query"
import { Star, Pencil } from "lucide-react"
import { useAuth } from "@/old-features/auth"
import { DkButton } from "@/old-features/ui/atoms/button"
import { DkDialog } from "@/old-features/ui/molecules/dialog"
import { useModal } from "@/lib/modals"
import { ReviewComposer } from "../molecules/review-composer"
import { reviewQueries, type ReviewOut } from "../review-queries"
import { ratingQueries, type MediaRatingOut } from "../rating-queries"
import { cn } from "@/lib/utils"

interface ReviewSectionProps {
 mediaId: string
 mediaType: string
 className?: string
}

function scoreColor(score: number): { text: string; glow: string } {
 if (score >= 8) return { text: "dk-review-section__score-value--emerald", glow: "dk-review-section__glow--emerald" }
 if (score >= 6) return { text: "dk-review-section__score-value--sky", glow: "dk-review-section__glow--sky" }
 if (score >= 4) return { text: "dk-review-section__score-value--amber", glow: "dk-review-section__glow--amber" }
 return { text: "dk-review-section__score-value--red", glow: "dk-review-section__glow--red" }
}

function StarRow({ count, filled, size = "md" }: { count: number; filled: number; size?: "sm" | "md" }) {
 const dims = size === "md" ? "w-6 h-6" : "w-4 h-4"
 return (
 <div className="flex items-center gap-0.5">
 {Array.from({ length: count }).map((_, i) => {
 const fill = Math.min(1, Math.max(0, filled - i))
 return (
 <span key={i} className="relative inline-block">
 <Star className={cn(dims, "text-white/[0.08]")} fill="currentColor" />
 {fill > 0 && (
 <Star
 className={cn(dims, "absolute inset-0 text-amber-400")}
 fill="currentColor"
 style={{
 clipPath: fill === 1 ? undefined : `inset(0 ${(1 - fill) * 100}% 0 0)`,
 }}
 />
 )}
 </span>
 )
 })}
 </div>
 )
}

function ReviewSection({ mediaId, mediaType, className }: ReviewSectionProps) {
 const { isAuthenticated } = useAuth()
 const { openModal } = useModal()

 const myReviewQuery = useQuery({
   ...reviewQueries.myReview(mediaType, mediaId),
   enabled: isAuthenticated,
 })
 const myRatingQuery = useQuery({
   ...ratingQueries.myRating(mediaType, mediaId),
   enabled: isAuthenticated,
 })

 const isLoading = myReviewQuery.isLoading || myRatingQuery.isLoading
 const isError = myReviewQuery.isError && myRatingQuery.isError

 if (!isAuthenticated) return null

 if (isLoading) {
   return (
     <section className={cn("dk-review-section", className)}>
       <h2 className="dk-review-section__heading">Your Rating</h2>
       <div className="dk-review-section__card dk-review-section__card--loading">
         <div className="dk-review-section__loading-inner">
           <div className="dk-review-section__skeleton dk-review-section__skeleton--title" />
           <div className="dk-review-section__skeleton dk-review-section__skeleton--button" />
         </div>
       </div>
     </section>
   )
 }

 if (isError) {
   return (
     <section className={cn("dk-review-section", className)}>
       <h2 className="dk-review-section__heading">Your Rating</h2>
       <div className="dk-review-section__card dk-review-section__card--error">
         <p className="dk-review-section__error-text">Failed to load your rating.</p>
         <DkButton variant="outline" size="sm" onClick={() => { myReviewQuery.refetch(); myRatingQuery.refetch() }}>
           Retry
         </DkButton>
       </div>
     </section>
   )
 }

 const review = (myReviewQuery.data ?? null) as ReviewOut | null
 const rating = (myRatingQuery.data ?? null) as MediaRatingOut | null
 const hasRatingOrReview = !!rating || !!review

 const handleOpenComposer = () => {
   const close = openModal(
     <DkDialog
       open={true}
       onOpenChange={() => close()}
       title={hasRatingOrReview ? "Edit Your Rating" : "Rate & Review"}
     >
       <ReviewComposer
         mediaType={mediaType}
         mediaId={mediaId}
         existingReview={review}
         existingRating={rating}
         onClose={() => close()}
       />
     </DkDialog>
   )
 }

 return (
   <section className={cn("dk-review-section", className)}>
     <h2 className="dk-review-section__heading">Your Rating</h2>

     {hasRatingOrReview ? (
       /* ── Rated/reviewed state — show-off display ── */
       <div className="dk-review-section__card dk-review-section__card--rated">
         {rating && (
           <div
             className={cn(
               "dk-review-section__glow",
               scoreColor(rating.score).glow,
             )}
           />
         )}

         <div className="dk-review-section__content-wrap">
           <div className="dk-review-section__layout">
             {/* Big score display */}
             {rating ? (
               <div className="dk-review-section__score-block">
                 <span
                   className={cn(
                     "dk-review-section__score-value",
                     scoreColor(rating.score).text,
                   )}
                   style={{ fontFamily: "var(--dk-font-mono)" }}
                 >
                   {rating.score}
                 </span>
                 <span className="dk-review-section__score-label">
                   out of 10
                 </span>
               </div>
             ) : (
               <div className="dk-review-section__score-block dk-review-section__score-block--empty">
                 <span
                   className="dk-review-section__score-value dk-review-section__score-value--empty"
                   style={{ fontFamily: "var(--dk-font-mono)" }}
                 >
                   —
                 </span>
                 <span className="dk-review-section__score-label">
                   no rating
                 </span>
               </div>
             )}

             {/* Stars + content */}
             <div className="dk-review-section__content-area">
               {rating && (
                 <StarRow count={5} filled={rating.score / 2} size="md" />
               )}

               {review?.title && (
                 <p className="dk-review-section__review-title">
                   {review.title}
                 </p>
               )}

               {review?.content && (
                 <p className="dk-review-section__review-content">
                   {review.content}
                 </p>
               )}

               {review?.isPrivate && (
                 <span className="dk-review-section__private-badge">
                   Private
                 </span>
               )}

               <DkButton
                 variant="outline"
                 size="sm"
                 onClick={handleOpenComposer}
                 className="dk-review-section__action"
               >
                 <Pencil className="w-3.5 h-3.5" />
                 Edit
               </DkButton>
             </div>
           </div>
         </div>
       </div>
     ) : (
       /* ── Unrated state — inviting prompt ── */
       <div className="dk-review-section__card dk-review-section__card--unrated">
         <div className="dk-review-section__glow dk-review-section__glow--unrated" />

         <div className="dk-review-section__content-wrap dk-review-section__prompt-area">
           <div className="dk-review-section__prompt-stars">
             <StarRow count={5} filled={0} size="md" />
             <p className="dk-review-section__prompt-text">How would you rate this?</p>
           </div>

           <DkButton
             variant="primary"
             size="md"
             onClick={handleOpenComposer}
           >
             <Star className="w-4 h-4" />
             Rate &amp; Review
           </DkButton>
         </div>
       </div>
     )}
   </section>
 )
}

export { ReviewSection }
