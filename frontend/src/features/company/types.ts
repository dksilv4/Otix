export interface CompanyDetail {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  originCountry: string | null
  description: string | null
  homepage: string | null
  followerCount: number
  isFollowed: boolean
  avgRating: number | null
  userRating: number | null
}

export interface CompanyFollowResponse {
  followed: boolean
  followerCount: number
}
