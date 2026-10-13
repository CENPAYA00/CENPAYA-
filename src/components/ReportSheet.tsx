import { useEffect, useState } from 'react';
import { X, ChevronRight, Check, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Reason = {
  code: string;
  label: string;
  description: string | null;
  display_order: number;
};

type TargetType = 'post' | 'user' | 'message' | 'listing' | 'group' | 'comment';

type Props = {
  targetType: TargetType;
  targetId: string;
  onClose: () => void;
  onSubmitted?: () => void;
};

export default function ReportSheet({ targetType, targetId, onClose, onSubmitted }: Props) {
  const [reasons, setReasons] = useState<Reason[]>([]);
  const [selected, setSelected] = useState<Reason | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('report_reasons')
        .select('code, label, description, display_order, applies_to')
        .contains('applies_to', [targetType])
        .order('display_order');
      setReasons((data || []) as Reason[]);
    })();
  }, [targetType]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setErr('');
    const { data, error } = await supabase.rpc('submit_report', {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason_code: selected.code,
      p_notes: notes.trim() || null,
    });
    if (error || !data?.ok) {
      setErr(error?.message || data?.error || 'Failed to submit report.');
      setBusy(false);
      return;
    }
    setDone(true);
    onSubmitted?.();
    setTimeout(() => onClose(), 1800);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/50 flex items-end" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-white dark:bg-darkcard rounded-t-2xl max-h-[88vh] overflow-y-auto animate-slide-up"
      >
        {/* Header */}
        <div className="p-3 border-b border-gray-100 dark:border-darkline flex items-center justify-between sticky top-0 bg-white dark:bg-darkcard z-10">
          <div className="flex items-center gap-2">
            {selected && !done && (
              <button onClick={() => setSelected(null)} className="text-navy dark:text-white">
                <ChevronRight size={18} className="rotate-180" />
              </button>
            )}
            <p className="text-[13px] font-bold text-navy dark:text-white">
              {done ? 'Report sent' : selected ? selected.label : 'Report'}
            </p>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Step 3: confirmation */}
        {done && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center mx-auto mb-3">
              <Check size={28} className="text-accent" />
            </div>
            <p className="text-[13px] font-bold text-navy dark:text-white">Thanks for reporting</p>
            <p className="text-[10px] text-gray-500 mt-1">
              Our team will review this. You may not hear back unless we need more info.
            </p>
          </div>
        )}

        {/* Step 2: notes + confirm */}
        {!done && selected && (
          <div className="p-4 space-y-3">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
              <p className="text-[11px] font-bold text-yellow-800 dark:text-yellow-200">
                You are reporting a {targetType}
              </p>
              <p className="text-[10px] text-yellow-700 dark:text-yellow-300 mt-0.5">
                {selected.label}
              </p>
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-600 dark:text-gray-400 mb-1 block">
                Add details (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Anything else we should know?"
                className="w-full p-2.5 border border-gray-200 dark:border-darkline rounded-lg bg-gray-50 dark:bg-darkbg text-xs resize-none"
              />
            </div>

            {err && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-[11px] p-2 rounded-lg flex items-start gap-2">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                {err}
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy}
              className="w-full bg-red-500 text-white font-bold py-3 rounded-xl text-[12px] disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'Submit report'}
            </button>
          </div>
        )}

        {/* Step 1: pick a reason */}
        {!done && !selected && (
          <>
            <div className="p-4 pb-2">
              <p className="text-[15px] font-bold text-navy dark:text-white mb-1">
                Why are you reporting this {targetType}?
              </p>
              <p className="text-[10px] text-gray-500">
                If someone is in immediate danger, contact local emergency services first. Don't wait.
              </p>
            </div>

            <div>
              {reasons.map((r) => (
                <button
                  key={r.code}
                  onClick={() => setSelected(r)}
                  className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-darkline last:border-b-0 text-left active:bg-gray-50 dark:active:bg-darkbg"
                >
                  <span className="text-[13px] text-navy dark:text-white flex-1 pr-3">{r.label}</span>
                  <ChevronRight size={16} className="text-gray-400 shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
  }
