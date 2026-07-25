export type MedicalDataStatus =
  | "measured"
  | "controlled"
  | "not_measured"
  | "not_examined"
  | "awaiting_review"
  | "simulated_normal"
  | "BLOCKED_MEDICAL";

export type GovernedMedicalDatum = {
  value: string;
  status: MedicalDataStatus | string;
  unit: string;
  referenceRange: string;
  timepoint: string;
  provenance: string;
  reviewerStatus: string;
  affectsDiagnosis: boolean;
  affectsScore: boolean;
  teacherReviewRequired: boolean;
  expressionZh: string;
  expressionEn: string;
  blockedReason: string;
  blockedUnsafeValueCount: number;
  blockedIncorrectNormalCount: number;
  components: GovernedMedicalDatum[];
};

export const MEDICAL_DATA_POLICY: {
  version: string;
  currentMeasurementProvenance: readonly string[];
  simulatedNormal: {
    allowedExamIds: readonly string[];
    approvedTemplates: Readonly<Record<string, unknown>>;
    deterministicOnly: boolean;
    mayExcludeEmergency: boolean;
    mayAffectDiagnosis: boolean;
    mayAffectScore: boolean;
  };
};

export function governPhysicalExamResult(
  caseData: Record<string, any>,
  item: Record<string, any> | undefined,
  configured: Record<string, any> | undefined
): GovernedMedicalDatum;

export function detectCaseMedicalDataConflicts(
  caseData: Record<string, any>,
  results: Array<Record<string, any>>
): Array<{ code: string; resultIds: string[] }>;

export function hypertensionControl(caseData: Record<string, any>): "well_controlled" | "uncontrolled" | "unknown";
export function hypertensionState(caseData: Record<string, any>): true | false | "needs_review" | "unknown";
export function sourceConflict(caseData: Record<string, any>, configured: Record<string, any>): string;
