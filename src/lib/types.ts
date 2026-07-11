export type PresentIllness = {
  onset: string;
  hematuriaType: string;
  hematuriaPhase: string;
  color: string;
  clots: string;
  duration: string;
  trigger: string;
  pain: string;
  urinaryFrequency: string;
  urgency: string;
  dysuria: string;
  flankPain: string;
  fever: string;
  voidingDifficulty: string;
};

export type RiskFactors = {
  smoking: string;
  alcohol: string;
  occupation: string;
  stoneHistory: string;
  infectionHistory: string;
  trauma: string;
  anticoagulants: string;
  tumorHistory: string;
  familyHistory: string;
};

export type Investigation = {
  type: string;
  result: string;
};

export type PatientAnswers = {
  color?: string;
  phase?: string;
  clots?: string;
  pain?: string;
  irritativeSymptoms?: string;
  smoking?: string;
  alcohol?: string;
  fever?: string;
  temperature?: string;
  stoneClues?: string;
  tumorRisk?: string;
  glomerularClues?: string;
  opening?: string;
};

export type ClinicalFields = {
  source: string;
  diseaseCategory: string;
  difficulty: string;
  triage: string;
  primaryProblem: string;
  redFlags: string;
  diagnosticReasoning: string;
  mustDifferentials: string;
  keyHistory: string;
  physicalExam: string;
  requiredLabs: string;
  specialTests: string;
  imagingAndProcedures: string;
  orderReason: string;
  consultDepartments: string;
  consultQuestions: string;
  immediateTreatment: string;
  definitiveTreatment: string;
  followUp: string;
  commonMisses: string;
  teacherScoringPoints: string;
  stagePath: string;
};

export type StageKey = "history" | "exam" | "orders" | "diagnosis" | "consult" | "treatment" | "perioperative" | "followup" | "debrief";

export type StructuredFactStatus = "present" | "absent" | "authoring_required";
export type StructuredFactProvenance = "source" | "author_added_for_simulation";

export type StructuredPatientFact = {
  status: StructuredFactStatus;
  patientAnswerZh: string;
  patientAnswerEn: string;
  provenance: StructuredFactProvenance;
  teacherReviewRequired: boolean;
};

export type StructuredSmokingHistory = Omit<StructuredPatientFact, "status"> & {
  status: "current" | "former" | "never" | "authoring_required";
  cigarettesPerDay: number;
  years: number;
  quitYears: number;
  packYears: number;
};

export type StructuredAlcoholHistory = Omit<StructuredPatientFact, "status"> & {
  status: "current" | "former" | "never" | "authoring_required";
  type: string;
  amount: string;
  frequency: string;
  years: number;
};

export type StructuredMedication = {
  name: string;
  dose: string;
  frequency: string;
  indication: string;
  provenance: StructuredFactProvenance;
  teacherReviewRequired: boolean;
};

export type StructuredHistory = {
  smokingHistory: StructuredSmokingHistory;
  alcoholHistory: StructuredAlcoholHistory;
  occupation: StructuredPatientFact;
  occupationalExposure: StructuredPatientFact;
  hypertension: StructuredPatientFact;
  diabetes: StructuredPatientFact;
  coronaryDisease: StructuredPatientFact;
  stroke: StructuredPatientFact;
  liverDisease: StructuredPatientFact;
  tuberculosis: StructuredPatientFact;
  stoneHistory: StructuredPatientFact;
  urinaryInfectionHistory: StructuredPatientFact;
  malignancyHistory: StructuredPatientFact;
  traumaHistory: StructuredPatientFact;
  urinaryProcedureHistory: StructuredPatientFact;
  surgeryHistory: StructuredPatientFact;
  transfusionHistory: StructuredPatientFact;
  allergyHistory: StructuredPatientFact;
  anticoagulantUse: StructuredPatientFact;
  antiplateletUse: StructuredPatientFact;
  familyHistory: StructuredPatientFact;
  menstrualHistory: StructuredPatientFact;
  pregnancyHistory: StructuredPatientFact;
  medicationList: StructuredMedication[];
  medicationAnswerZh: string;
  medicationAnswerEn: string;
};

export type StageTask = {
  caseId: string;
  stageKey: StageKey;
  stageName: string;
  studentTask: string;
  standardAnswer: string;
  availableFields: string;
  hiddenUntilSubmitted: boolean;
};

export type OrderPackage = {
  packageId: string;
  name?: string;
  scenario: string;
  basicLabs: string;
  specialTests: string;
  imagingAndProcedures: string;
  requiredConsults?: string;
  reason: string;
  cautions: string;
  sourceUrls: string;
  frontendTag?: string;
};

export type OrderCatalogItem = {
  orderId: string;
  primaryCategory: "检验" | "检查" | "病理/操作" | "围术期评估" | string;
  secondaryCategory: string;
  tertiaryCategory?: string;
  displayName: string;
  synonyms: string[];
  scenario: string;
  resultShouldInclude: string;
  priority: string;
  studentDisplayHint: string;
  cautions: string;
  sourceUrl: string;
};

export type ConsultCatalogItem = {
  consultId: string;
  group: "外科" | "内科" | "辅助/平台" | "急诊/危重" | string;
  department: string;
  triggers: string;
  questions: string;
  commonCases: string;
  coreLevel: string;
  studentDisplayHint: string;
  evaluatorRule: string;
};

export type UiReleaseRule = {
  stage: string;
  preSubmitAllowed: string;
  preSubmitForbidden: string;
  postSubmitAllowed: string;
  technicalAdvice: string;
};

export type ConsultRule = {
  ruleId: string;
  trigger: string;
  departments: string;
  questions: string;
  exampleCases: string;
  requiredKeywords: string;
};

export type TreatmentPathway = {
  pathId: string;
  diseaseOrScenario: string;
  immediateTreatment: string;
  definitiveTreatment: string;
  followUp: string;
  mustNotMiss: string;
};

export type ScoringTemplateItem = {
  id: string;
  dimension: string;
  max: number;
  coreRequirements: string;
  excellentPerformance: string;
  deductionPoints: string;
  scoringAdvice: string;
};

export type InterviewSlot = {
  slotId: string;
  label: string;
  recommendedQuestion: string;
  triggers: string[];
  wideField: string;
  isKey: boolean;
  score: number;
  missingFeedback: string;
};

export type InterviewAnswer = {
  caseId: string;
  slotId: string;
  label: string;
  possibleQuestion: string;
  patientAnswer: string;
  clinicalMeaning: string;
  scoringKeywords: string;
  finalDiagnosis: string;
  correctedDiseaseCategory: string;
};

export type PatientPersona = {
  emotion: string;
  expressionAbility: string;
  healthLiteracy: string;
  memoryReliability: string;
  cooperation: string;
  communicationNote: string;
};

export type PhysicalExamItem = {
  examId: string;
  category: string;
  displayName: string;
  synonyms: string[];
  studentHint?: string;
};

export type PhysicalExamResult = {
  caseId: string;
  examId: string;
  displayName: string;
  category: string;
  applicableSex?: Array<"男" | "女">;
  minimumAge?: number;
  maximumAge?: number;
  applicableDiseaseCategories?: string[];
  result: string;
  abnormal?: boolean;
  teachingNote: string;
  studentVisibleAfterSelection?: boolean;
  teacherOnlyRationale?: string;
};

export type OsceRubricItem = {
  station: string;
  dimension: string;
  max: number;
  observableBehavior: string;
  criticalErrors: string;
};

export type CaseCardItem = {
  caseId: string;
  category: string;
  fieldName: string;
  value: string;
  visibility: string;
  releaseCondition: string;
  agent: string;
};

export type OrderResultItem = {
  caseId: string;
  orderId?: string;
  diagnosis: string;
  diseaseType: string;
  orderCategory: string;
  synonyms: string[];
  result: string;
  abnormalLevel: string;
  teachingExplanation: string;
  isKey: boolean;
  prerequisite: string;
};

export type AgentConfig = {
  name: string;
  responsibility: string;
  input: string;
  output: string;
  boundaries: string;
  triggerStage: string;
};

export type RagRule = {
  id: string;
  topic: string;
  ruleName: string;
  standardPath: string;
  commonError: string;
  guardrail: string;
  sourceIds: string;
};

export type LayeredReleaseRule = {
  stage: string;
  trigger: string;
  allowedInfo: string;
  forbiddenInfo: string;
  agentOrTool: string;
};

export type MdtTrigger = {
  caseId: string;
  diagnosis: string;
  diseaseType: string;
  required: boolean;
  idealTiming: string;
  departments: string;
  purpose: string;
  missedPenalty: string;
  expertChallenge: string;
};

export type EvaluatorRubricItem = {
  dimension: string;
  max: number;
  observation: string;
  autoEvidence: string;
  redFlags: string;
  relatedAgent: string;
};

export type RctProtocolItem = {
  module: string;
  design: string;
  implementation: string;
  dataFields: string;
  biasControl: string;
};

export type RctQuestionnaireItem = {
  scale: string;
  item: string;
  scoring: string;
  anchor: string;
};

export type AgentCaseProfile = {
  patientPersona: string;
  patientVisibleInfo: string;
  layeredReleaseRule: string;
  labOrders: string;
  imagingOrders: string;
  resultInterpretation: string;
  initialTreatmentPlan: string;
  nextTreatmentAfterResults: string;
  perioperativePreparation: string;
  mdtDepartments: string;
  mdtTrigger: string;
  mdtQuestions: string;
  evaluatorDeductions: string;
  pathwayGuardrail: string;
  ragPriority: string;
};

export type CaseData = {
  id: string;
  schemaVersion?: string;
  caseVersion?: string;
  languages?: string[];
  diseaseSubcategory?: string;
  standardChiefComplaint?: string;
  reproductiveHistory?: string;
  patientRole?: {
    identity: string;
    concerns: string;
    affect: string;
    communicationStyle: string;
  };
  questionSlotIds?: string[];
  availableOrderIds?: string[];
  physicalExamResultIds?: string[];
  orderPrerequisites?: Array<{ orderId: string; prerequisite: string }>;
  emergencyRedFlags?: string[];
  criticalErrors?: string[];
  medicalReview?: {
    status: "pending" | "reviewed" | "needs_revision";
    references: Array<{ title: string; url: string }>;
    lastReviewedDate: string;
  };
  structuredHistory?: StructuredHistory;
  standardManagement?: {
    immediate: string;
    definitive: string;
    perioperative: string;
    followUp: string;
    critical: string[];
  };
  sourcePatientId: string;
  title: string;
  difficulty?: string;
  diseaseCategory?: string;
  age: string;
  sex: string;
  studentChiefComplaint: string;
  chiefComplaint: string;
  presentIllness: PresentIllness;
  riskFactors: RiskFactors;
  pastHistory: string;
  personalHistory: string;
  familyHistory: string;
  medication: string;
  urineTestResult: string;
  investigations: Investigation[];
  patientAnswers?: PatientAnswers;
  patientPersona?: PatientPersona;
  diagnosis: string;
  teachingPoints: string[];
  standardSummary: string;
  differentialDiagnosis: string[];
  teacherComment: string;
  scoringKey: string[];
  clinical?: ClinicalFields;
  stageTasks?: StageTask[];
  interviewAnswers?: Record<string, InterviewAnswer>;
  agentProfile?: AgentCaseProfile;
  caseCard?: CaseCardItem[];
  raw: {
    symptomsDetail: string;
    medicalHistory: string;
    sheetName: string;
  };
};

export type KeyPointId =
  | "onset"
  | "hematuriaType"
  | "hematuriaPhase"
  | "colorClots"
  | "irritativeSymptoms"
  | "flankPain"
  | "fever"
  | "voidingDifficulty"
  | "smoking"
  | "occupation"
  | "stoneHistory"
  | "infectionHistory"
  | "trauma"
  | "anticoagulants"
  | "tumorFamilyHistory"
  | "historyBundle";

export type CollectedMap = Record<KeyPointId, boolean>;

export type ChatMessage = {
  role: "student" | "patient";
  text: string;
  matchedKeys?: KeyPointId[];
  matchedSlots?: string[];
};

export type StudentSummary = {
  presentIllnessSummary: string;
  positiveSymptoms: string;
  negativeSymptoms: string;
  preliminaryDiagnosis: string;
  differentialDiagnosis: string;
  nextTests: string;
};

export type ScoreItem = {
  id: string;
  label: string;
  max: number;
  score: number;
  comment: string;
};

export type ScoreReport = {
  total: number;
  items: ScoreItem[];
  collected: KeyPointId[];
  missing: KeyPointId[];
  summaryFeedback: string;
  standardSummary: string;
  differentialThinking: string;
  teacherComment: string;
};
