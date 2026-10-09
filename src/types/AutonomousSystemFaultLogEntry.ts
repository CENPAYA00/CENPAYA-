export interface AutonomousSystemFaultLogEntry {
  id: string;
  component_context: string;
  error_message: string;
  execution_delay_ms: number;
  is_circuit_tripped: boolean | null;
  logged_at: string | null;
}