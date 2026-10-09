import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { AdminAuditLog } from '../../types/AdminAuditLog';

export default function AdminAuditLogViewer() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (data) setLogs(data as AdminAuditLog[]);
      if (error) console.error('Error loading audit log:', error);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  if (loading) return <div className="p-4 text-center">Loading audit log...</div>;

  return (
    <div>
      <h2 className="text-2xl font-bold text-navy mb-4">📜 Audit Log</h2>
      <p className="text-sm text-gray-500 mb-4">Every admin action is permanently recorded here.</p>

      {logs.length === 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm text-center text-gray-500">
          No admin actions recorded yet.
        </div>
      )}

      {logs.map((log) => (
        <div key={log.id} className="bg-white p-4 rounded-xl shadow-sm mb-2">
          <div className="flex justify-between items-start mb-1">
            <p className="font-bold text-navy text-sm">{log.action}</p>
            <p className="text-xs text-gray-400">
              {new Date(log.created_at).toLocaleString()}
            </p>
          </div>
          <p className="text-xs text-gray-500">
            Actor: {log.actor_id.slice(0, 8)}...
            {log.target_user_id && ` | Target: ${log.target_user_id.slice(0, 8)}...`}
          </p>
          {log.target_table && (
            <p className="text-xs text-gray-400 mt-1">Table: {log.target_table}</p>
          )}
          {log.new_value && (
            <details className="mt-2">
              <summary className="text-xs text-gold cursor-pointer font-bold">
                View Changes
              </summary>
              <pre className="text-xs bg-gray-50 p-2 rounded mt-2 overflow-x-auto">
                {JSON.stringify(log.new_value, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}