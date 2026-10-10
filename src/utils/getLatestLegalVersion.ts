import { supabase } from '../lib/supabase';
import { LegalDocument } from '../types/LegalDocument';
import { LegalDocumentVersion } from '../types/LegalDocumentVersion';

export interface LegalDocumentWithVersion {
  document: LegalDocument;
  version: LegalDocumentVersion | null;
}

export async function getLatestLegalVersion(
  slug: string
): Promise<LegalDocumentWithVersion | null> {
  // 1. Fetch the document by slug
  const { data: doc, error: docError } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('slug', slug)
    .single();

  if (docError || !doc) return null;

  // 2. Fetch the current active version (effective_until is null = current)
  const { data: version } = await supabase
    .from('legal_document_versions')
    .select('*')
    .eq('document_id', doc.id)
    .is('effective_until', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    document: doc as LegalDocument,
    version: (version as LegalDocumentVersion) || null,
  };
}

export async function getAllRequiredLegalDocuments(): Promise<LegalDocument[]> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('is_required', true)
    .order('display_order', { ascending: true });

  if (error || !data) return [];
  return data as LegalDocument[];
}
