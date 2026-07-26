// Infers a TypeScript shape from a set of recorded JSON samples (handover E:
// "infer from ALL recorded Runs of that resource, not a single sample — union
// differing types, mark fields absent in some samples as optional, detect
// nullability, and infer string-literal unions for small closed sets").
//
// Deliberately flatter than a full quicktype-style engine: a field is assumed
// to be consistently primitive OR object OR array across samples (mixing all
// three for the same field is a pathological edge case, not the common shape
// of a real API response) — see ../../DECISIONS.md.

const ENUM_MAX_DISTINCT = 8;

type PrimitiveKind = "string" | "number" | "boolean" | "null";

export type FieldInfo = { type: InferredType; presentCount: number };

export type InferredType = {
  kinds: Set<PrimitiveKind>;
  // Non-null while every string value observed so far still fits a small
  // closed set; degrades to `null` (meaning "just a string") once it doesn't.
  stringValues: Set<string> | null;
  objectFields: Record<string, FieldInfo> | null;
  arrayElement: InferredType | null;
  sampleCount: number;
};

function emptyInferred(): InferredType {
  return { kinds: new Set(), stringValues: new Set(), objectFields: null, arrayElement: null, sampleCount: 0 };
}

function inferValueInto(target: InferredType, value: unknown): void {
  target.sampleCount++;

  if (value === null || value === undefined) {
    target.kinds.add("null");
    return;
  }

  if (Array.isArray(value)) {
    target.arrayElement ??= emptyInferred();
    for (const item of value) inferValueInto(target.arrayElement, item);
    return;
  }

  if (typeof value === "object") {
    target.objectFields ??= {};
    for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      const field = (target.objectFields[key] ??= { type: emptyInferred(), presentCount: 0 });
      field.presentCount++;
      inferValueInto(field.type, fieldValue);
    }
    return;
  }

  if (typeof value === "string") {
    target.kinds.add("string");
    if (target.stringValues) {
      target.stringValues.add(value);
      if (target.stringValues.size > ENUM_MAX_DISTINCT) target.stringValues = null;
    }
    return;
  }

  if (typeof value === "number") {
    target.kinds.add("number");
    return;
  }

  if (typeof value === "boolean") {
    target.kinds.add("boolean");
  }
}

export function inferTypeFromSamples(samples: unknown[]): InferredType {
  const root = emptyInferred();
  for (const sample of samples) inferValueInto(root, sample);
  return root;
}

// Low cardinality alone doesn't prove a closed set — with few samples, an id,
// email, or timestamp field trivially has "few distinct values" too. The
// signal that actually distinguishes a real enum is *repetition*: at least
// one value recurring across samples. A field where every observed value is
// unique (distinctCount === sampleCount) is presumed high-cardinality even if
// that count is small.
export function isEnumLike(type: InferredType): boolean {
  return (
    type.kinds.size === 1 &&
    type.kinds.has("string") &&
    type.stringValues !== null &&
    type.stringValues.size > 0 &&
    type.stringValues.size < type.sampleCount
  );
}

function safeKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function renderType(type: InferredType, indent: number): string {
  const parts: string[] = [];

  if (type.objectFields) {
    const pad = "  ".repeat(indent + 1);
    const closePad = "  ".repeat(indent);
    const lines = Object.entries(type.objectFields).map(([key, field]) => {
      const optional = field.presentCount < type.sampleCount ? "?" : "";
      return `${pad}${safeKey(key)}${optional}: ${renderType(field.type, indent + 1)};`;
    });
    parts.push(lines.length > 0 ? `{\n${lines.join("\n")}\n${closePad}}` : "Record<string, never>");
  }

  if (type.arrayElement) {
    parts.push(`Array<${renderType(type.arrayElement, indent)}>`);
  }

  if (type.kinds.has("string")) {
    parts.push(
      isEnumLike(type) && type.stringValues
        ? [...type.stringValues].map((value) => JSON.stringify(value)).join(" | ")
        : "string",
    );
  }
  if (type.kinds.has("number")) parts.push("number");
  if (type.kinds.has("boolean")) parts.push("boolean");
  if (type.kinds.has("null")) parts.push("null");

  return parts.length > 0 ? parts.join(" | ") : "unknown";
}

export function renderTypeScript(typeName: string, inferred: InferredType): string {
  return `export type ${typeName} = ${renderType(inferred, 0)};\n`;
}
