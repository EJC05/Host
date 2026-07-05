export type SuiteType =
  | "real_estate_agent"
  | "creator_influencer"
  | "coach_consultant"
  | "business_brand"
  | "custom";
export type SuiteAccess = "free" | "paid";
export type MemberRole = "owner" | "member";
export type TabKind =
  | "home"
  | "rooms"
  | "about"
  | "links"
  | "members"
  | "contact"
  | "custom";

export type PostVisibility = "public" | "free_members" | "paid_members";
export type PostStatus = "draft" | "published";
export type MembershipTier = "free" | "paid";

export interface Suite {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  suite_type: SuiteType;
  access: SuiteAccess;
  logo_url: string | null;
  brand_color: string | null;
  published: boolean;
  tagline: string | null;
  about: string | null;
  cover_image_url: string | null;
  accent_color: string | null;
  theme: "light" | "dark";
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  billing_status: BillingStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_connect_id: string | null;
  connect_ready: boolean;
  created_at: string;
  updated_at: string;
}

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled";

export type MembershipStatus = "active" | "past_due" | "canceled";

export interface Transaction {
  id: string;
  suite_id: string;
  user_id: string | null;
  kind: "member_payment" | "saas_payment" | "payment_failed" | "refund";
  amount_cents: number;
  currency: string;
  application_fee_cents: number | null;
  stripe_ref: string | null;
  created_at: string;
}

export interface PostMedia {
  image_url?: string;
  video_url?: string;
}

export interface Post {
  id: string;
  suite_id: string;
  author_id: string;
  title: string;
  excerpt: string | null;
  media: PostMedia;
  visibility: PostVisibility;
  status: PostStatus;
  pinned: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostBody {
  post_id: string;
  body: string;
  updated_at: string;
}

export interface SuiteTab {
  id: string;
  suite_id: string;
  title: string;
  kind: TabKind;
  position: number;
  is_public: boolean;
  created_at: string;
}

export interface Room {
  id: string;
  suite_id: string;
  name: string;
  description: string | null;
  position: number;
  created_at: string;
}

export interface Plan {
  id: string;
  suite_id: string;
  name: string;
  price_cents: number;
  currency: string;
  billing_interval: "month" | "year";
  is_active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  stripe_price_cents: number | null;
  created_at: string;
}

export interface Membership {
  id: string;
  suite_id: string;
  user_id: string;
  role: MemberRole;
  tier: MembershipTier;
  status: MembershipStatus;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
