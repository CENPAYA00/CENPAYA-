export interface ApplicationFeatureFlag {
  id: string;
  feature_key: string;
  display_name: string;
  description: string | null;
  category: string | null;
  is_enabled_globally: boolean;
  unlocked_for_subscribers_only: boolean;
  rollout_percentage: number;
  target_countries: string[] | null;
  target_roles: string[] | null;
  enabled_for_admins: boolean;
  target_minimum_app_version: string | null;
  updated_by: string | null;
  updated_at: string | null;
}