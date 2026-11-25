export interface UserLegalAcceptance {
  id: string;
  user_id: string;
  document_id: string;
  version_id: string;
  accepted_at: string;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  acceptance_method: string;
}