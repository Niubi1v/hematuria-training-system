export type DataAgentLanguage = "zh" | "en";

export const ENGLISH_CATEGORY_PLACEHOLDER: string;
export const ENGLISH_EXAM_PLACEHOLDER: string;
export const ENGLISH_METADATA_PLACEHOLDER: string;
export const ENGLISH_ORDER_PLACEHOLDER: string;
export const ENGLISH_RESULT_PLACEHOLDER: string;

export function containsCjk(value: unknown): boolean;
export function firstEnglishAlias(order: { orderId?: string; synonyms?: string[] }): string;
export function needsReviewedMetadata(
  order: { primaryCategory?: string },
  result: { status?: string; value?: string; unit?: string; referenceRange?: string }
): boolean;
export function presentOrderCatalogItem<T extends Record<string, unknown>>(order: T, language?: DataAgentLanguage): T & {
  primaryCategoryLabel?: string;
  secondaryCategoryLabel?: string;
  priorityLabel?: string;
  studentDisplayHintLabel?: string;
  translationAvailable: boolean;
};
export function presentPhysicalExamItem<T extends Record<string, unknown>>(item: T, language?: DataAgentLanguage): T & {
  translationAvailable: boolean;
};
export function presentOrderResult<TOrder extends Record<string, unknown>, TResult extends Record<string, unknown>>(
  order: TOrder,
  result: TResult,
  language?: DataAgentLanguage
): TResult & {
  orderCategory: string;
  result?: string;
  abnormalLevel: string;
  abnormalFlags?: string[];
  metadataStatus: "complete" | "awaiting_reviewed_metadata";
  translationStatus: string;
};
export function presentMatchedOrder(
  order: { orderId: string; displayName?: string; synonyms?: string[] },
  language?: DataAgentLanguage
): { orderId: string; displayName: string; translationAvailable: boolean };
export function presentExamResult(result: unknown, language?: DataAgentLanguage): {
  text: string;
  translationStatus: string;
};
export function reportStatusPresentation(
  item: { status?: string; abnormalFlags?: string[]; abnormalLevel?: string },
  language?: DataAgentLanguage
): { state: "needs-review" | "abnormal" | "normal" | "reported"; label: string };
export function safeStudentFacingText(value: unknown, language?: DataAgentLanguage, placeholder?: string): string;
