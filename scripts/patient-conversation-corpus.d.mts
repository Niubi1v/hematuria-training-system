export type PatientConversationProbe = {
  id: string;
  kind: string;
  question: string;
  conversationHistory: Array<{ role: "student" | "patient"; text: string }>;
};

export function buildPatientConversationCorpus(): {
  zh: PatientConversationProbe[];
  en: PatientConversationProbe[];
};
