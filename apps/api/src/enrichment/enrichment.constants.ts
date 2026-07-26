/** Single BullMQ queue for on-demand word enrichment. */
export const ENRICHMENT_QUEUE = 'enrichment';

export interface EnrichmentJobData {
  dictionaryEntryId: string;
  /** When true, skips user quota and uses a higher-quality model (triggered by user reports). */
  betterModel?: boolean;
}
