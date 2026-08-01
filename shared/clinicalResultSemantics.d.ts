export type ClinicalResultAssessment = {
  compatible: boolean;
  reason: string;
  kind: string;
  normalizedResult: string;
};

export function assessClinicalResult(input?: {
  domain?: string;
  itemId?: string;
  displayName?: string;
  result?: string;
  projection?: boolean;
}): ClinicalResultAssessment;

export function clinicalResultFingerprint(value: unknown, displayName?: string): string;
export function normalizeResultSegment(value: unknown, displayName?: string): string;
export function orderKind(itemId: unknown, displayName?: string, domain?: string): string;
export function projectClinicalResult(
  result: { value?: unknown; impression?: unknown; result?: unknown } | undefined,
  displayName?: string
): { value: string; impression: string; result: string };
export function resultSegments(value: unknown, displayName?: string): string[];
