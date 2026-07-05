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
  created_at: string;
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
  created_at: string;
}

export interface Membership {
  id: string;
  suite_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
