import {
  rand,
  randAmount,
  randBoolean,
  randEmail,
  randFirstName,
  randFullName,
  randLastName,
  randNoun,
  randNumber,
  randPastDate,
  randPhoneNumber,
  randSentence,
  randStatus,
  randUrl,
  randUserName,
  randUuid,
} from "@ngneat/falso";

import { isEnumLike, type FieldInfo, type InferredType } from "./type-inference";

// Handover F: "must be semantic, not structural... infer intent from field
// names... and from observed enums in recorded Runs. A type-only generator
// that emits 'string' and 0 is a failure." Ground truth (an observed closed
// set of real values) always wins over a name-based guess.

const AMOUNT_PATTERN = /price|amount|cost|total|balance/i;
const ID_PATTERN = /^(id|uuid|guid)$|_(id|uuid|guid)$|(Id|Uuid|Guid)$/;

const FIELD_HEURISTICS: Array<{ pattern: RegExp; generate: () => unknown }> = [
  { pattern: /email/i, generate: () => randEmail() },
  { pattern: /^user.?name$/i, generate: () => randUserName() },
  { pattern: /first.?name/i, generate: () => randFirstName() },
  { pattern: /last.?name/i, generate: () => randLastName() },
  { pattern: /name$/i, generate: () => randFullName() },
  { pattern: /phone/i, generate: () => randPhoneNumber() },
  { pattern: /url|link|website/i, generate: () => randUrl() },
  { pattern: AMOUNT_PATTERN, generate: () => randAmount() },
  { pattern: /_at$|date$|timestamp$/i, generate: () => randPastDate().toISOString() },
  { pattern: /status|state$/i, generate: () => randStatus() },
  { pattern: /description|bio|summary|content|note/i, generate: () => randSentence() },
];

function fakeStringValue(fieldName: string): unknown {
  if (ID_PATTERN.test(fieldName)) return randUuid();
  const heuristic = FIELD_HEURISTICS.find((entry) => entry.pattern.test(fieldName));
  return heuristic ? heuristic.generate() : randNoun();
}

function fakeObject(fields: Record<string, FieldInfo>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) result[key] = fakeValueForType(key, field.type);
  return result;
}

function fakeValueForType(fieldName: string, type: InferredType): unknown {
  if (isEnumLike(type) && type.stringValues) return rand([...type.stringValues]);

  if (type.objectFields) return fakeObject(type.objectFields);
  if (type.arrayElement) {
    return [fakeValueForType(fieldName, type.arrayElement), fakeValueForType(fieldName, type.arrayElement)];
  }

  if (type.kinds.has("string")) return fakeStringValue(fieldName);
  if (type.kinds.has("number")) return AMOUNT_PATTERN.test(fieldName) ? randAmount() : randNumber();
  if (type.kinds.has("boolean")) return randBoolean();
  return null;
}

export function generateFakeRecords(inferred: InferredType, count: number): unknown[] {
  const recordType = inferred.arrayElement ?? inferred;
  return Array.from({ length: count }, () => fakeValueForType("root", recordType));
}
