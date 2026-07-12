const BILINGUAL_CONFLICT_REASON = "medical_bilingual_conflict_pending_review";

const conflictPairs = [
  ["P001", "pain"],
  ["P001", "dysuria"],
  ["P001", "urinary_urgency"],
  ["P002", "urinary_frequency"],
  ["P002", "urinary_urgency"],
  ["P003", "pain"],
  ["P003", "dysuria"],
  ["P003", "urinary_urgency"],
  ["P004", "pain"],
  ["P004", "dysuria"],
  ["P004", "urinary_urgency"],
  ["P007", "urinary_urgency"],
  ["P008", "urinary_urgency"],
  ["P010", "urinary_urgency"],
  ["P011", "urinary_urgency"],
  ["P012", "urinary_urgency"],
  ["HX-ADD-001", "pain"],
  ["HX-ADD-005", "pain"]
];

const bilingualConflictEntries = Object.freeze(conflictPairs.map(([caseId, field], index) => Object.freeze({
  reviewItemId: `HEM-P0-023-${String(index + 1).padStart(3, "0")}`,
  caseId,
  field
})));
const conflictKeys = new Set(bilingualConflictEntries.map((item) => `${item.caseId}:${item.field}`));

function isBilingualConflict(caseId, field) {
  return conflictKeys.has(`${caseId}:${field}`);
}

function uncertainConflictReply(language = "zh") {
  return language === "en" ? "I'm not sure about that right now." : "这项情况我现在说不准。";
}

function quarantineForMatchedSlots(caseId, slotIds = []) {
  const conflictingSlotIds = [...new Set(slotIds.filter((slotId) => isBilingualConflict(caseId, slotId)))];
  return {
    conflictingSlotIds,
    reason: conflictingSlotIds.length ? BILINGUAL_CONFLICT_REASON : ""
  };
}

function filterQuarantinedEvents(caseId, events = []) {
  const quarantinedSlotIds = [...new Set(events.map((event) => event.slotId).filter((slotId) => isBilingualConflict(caseId, slotId)))];
  return {
    events: events.filter((event) => !isBilingualConflict(caseId, event.slotId)),
    quarantinedSlotIds,
    reason: quarantinedSlotIds.length ? BILINGUAL_CONFLICT_REASON : ""
  };
}

module.exports = {
  BILINGUAL_CONFLICT_REASON,
  bilingualConflictEntries,
  filterQuarantinedEvents,
  isBilingualConflict,
  quarantineForMatchedSlots,
  uncertainConflictReply
};
