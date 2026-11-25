import {
  LogIn, LogOut, UserPlus, FileText, Trash2, Heart, MessageCircle,
  Share2, UserCheck, UserMinus, Send, Pencil, KeyRound, Image,
  Store, ShoppingBag, Wallet, ArrowDownToLine, Crown, Users, Flag
} from 'lucide-react';

export const ACTIVITY_ACTIONS = {
  login:                { label: 'Logged in',                 icon: LogIn },
  logout:               { label: 'Logged out',                icon: LogOut },
  signup:               { label: 'Created account',           icon: UserPlus },
  post_created:         { label: 'Created a post',            icon: FileText },
  post_deleted:         { label: 'Deleted a post',            icon: Trash2 },
  post_liked:           { label: 'Liked a post',              icon: Heart },
  post_commented:       { label: 'Commented on a post',       icon: MessageCircle },
  post_shared:          { label: 'Shared a post',             icon: Share2 },
  follow_added:         { label: 'Followed someone',          icon: UserCheck },
  follow_removed:       { label: 'Unfollowed someone',        icon: UserMinus },
  message_sent:         { label: 'Sent a message',            icon: Send },
  profile_updated:      { label: 'Updated profile',           icon: Pencil },
  password_changed:     { label: 'Changed password',          icon: KeyRound },
  avatar_changed:       { label: 'Changed avatar',            icon: Image },
  listing_created:      { label: 'Created a listing',         icon: Store },
  order_placed:         { label: 'Placed an order',           icon: ShoppingBag },
  wallet_topup:         { label: 'Topped up wallet',          icon: Wallet },
  wallet_withdraw:      { label: 'Withdrew from wallet',      icon: ArrowDownToLine },
  subscription_purchased: { label: 'Purchased subscription',  icon: Crown },
  group_created:        { label: 'Created a group',           icon: Users },
  report_submitted:     { label: 'Submitted a report',        icon: Flag },
} as const;

export type ActivityActionKey = keyof typeof ACTIVITY_ACTIONS;

export const ALL_ACTIVITY_ACTIONS = Object.keys(ACTIVITY_ACTIONS) as ActivityActionKey[];
