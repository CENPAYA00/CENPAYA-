import { d1Request } from '../lib/d1Api';
import { LegalDocument } from '../types/LegalDocument';
import { LegalDocumentVersion } from '../types/LegalDocumentVersion';

export interface LegalDocumentWithVersion {
  document: LegalDocument;
  version: LegalDocumentVersion | null;
}

export async function getLatestLegalVersion(slug: string): Promise<LegalDocumentWithVersion | null> {
  try {
    const result = await d1Request<{ data: LegalDocumentWithVersion }>(`/api/legal/${encodeURIComponent(slug)}?current=true`);
    return result.data || null;
  } catch { return null; }
}

export async function getAllRequiredLegalDocuments(): Promise<LegalDocument[]> {
  try {
    const result = await d1Request<{ data: LegalDocument[] }>('/api/legal?required=true');
    return result.data || [];
  } catch { return []; }
}
