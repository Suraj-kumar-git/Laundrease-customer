// ============================================================
// Referral, Profile & Wallet — Type Definitions
// ============================================================

// ---- Referral Program ---------------------------------------

export interface ReferralProgramConfig {
  is_active: boolean
  program_name: string
  program_description: string | null
  referrer_reward_percent: number
  referrer_max_reward_per_order: number
  referrer_max_orders_per_referee: number
  referee_discount_type: 'percent' | 'flat'
  referee_discount_value: number
  referee_discount_max_amount: number | null
  min_order_amount_for_reward: number
  referral_code_prefix: string
}

export interface CustomerReferralData {
  code: string
  total_referrals: number
  total_earnings: number
  is_active: boolean
  created_at: string
  // Referee list
  referees: RefereeEntry[]
  // Own referral status (was this user referred?)
  was_referred: boolean
  referred_by_code: string | null
  own_coupon_code: string | null       // referee coupon code if was referred
  own_discount_applied: boolean
}

export interface RefereeEntry {
  referee_name: string                  // masked: "Rahul S."
  orders_counted: number
  total_earned_by_referrer: number
  status: 'active' | 'completed' | 'voided'
  created_at: string
  // Per-order rewards
  reward_transactions: ReferralRewardTransaction[]
}

export interface ReferralRewardTransaction {
  order_id: number
  order_amount: number
  reward_percent: number
  reward_amount: number
  created_at: string
}

// ---- Profile ------------------------------------------------

export interface CustomerProfile {
  // From users
  id: string
  full_name: string
  email: string
  phone: string | null
  profile_image: string | null
  email_verified: boolean
  phone_verified: boolean
  created_at: string
  // From customer_profiles
  loyalty_points: number
  total_orders: number
  last_order_at: string | null
  marketing_opt_in: boolean
  // From wallet
  wallet_balance: number
}

export interface ProfileUpdatePayload {
  full_name: string
  phone: string
}

export interface PasswordChangePayload {
  current_password: string
  new_password: string
}

// ---- Wallet -------------------------------------------------

export interface WalletData {
  balance: number
  currency: string
  transactions: WalletTransaction[]
}

export interface WalletTransaction {
  id: number
  kind: 'credit' | 'debit'
  amount: number
  reference: string | null
  metadata: Record<string, any> | null
  created_at: string
}

// ---- Settings -----------------------------------------------

export interface NotificationPreference {
  category: string
  label: string
  description: string
  email: boolean
  sms: boolean
  push: boolean
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreference[] = [
  { category: 'orders', label: 'Order Updates', description: 'Pickup confirmed, laundry in progress, out for delivery', email: true, sms: true, push: true },
  { category: 'promotions', label: 'Promotions & Offers', description: 'Discount codes, flash sales, and seasonal offers', email: true, sms: false, push: true },
  { category: 'referrals', label: 'Referral Rewards', description: 'When your referral places an order and you earn', email: true, sms: false, push: true },
  { category: 'security', label: 'Security Alerts', description: 'Login from new device, password changes', email: true, sms: true, push: true },
  { category: 'reminders', label: 'Reminders', description: 'Incomplete orders, scheduled pickups', email: false, sms: true, push: true },
]
