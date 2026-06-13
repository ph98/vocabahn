/** Single BullMQ queue for on-demand word enrichment (PRD §6). */
export const ENRICHMENT_QUEUE = 'enrichment';

export interface EnrichmentJobData {
  dictionaryEntryId: string;
}
