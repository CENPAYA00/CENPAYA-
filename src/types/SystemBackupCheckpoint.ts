export interface SystemBackupCheckpoint {
  id: string;
  checkpoint_name: string;
  total_users_tracked: number;
  aggregated_platform_fiat_xaf: number;
  aggregated_platform_fiat_xof: number;
  captured_at: string | null;
}