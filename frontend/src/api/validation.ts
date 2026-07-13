const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readString(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const value = record[field]

  if (typeof value !== 'string') {
    throw new Error(`${context} contient un champ « ${field} » invalide.`)
  }

  return value
}

export function readUuid(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const value = readString(record, field, context)

  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${context} contient un UUID « ${field} » invalide.`)
  }

  return value
}

export function readNullableString(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string | null {
  const value = record[field]

  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error(`${context} contient un champ « ${field} » invalide.`)
  }

  return value
}

export function readNullableUuid(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string | null {
  const value = readNullableString(record, field, context)

  if (value !== null && !UUID_PATTERN.test(value)) {
    throw new Error(`${context} contient un UUID « ${field} » invalide.`)
  }

  return value
}

export function readNumber(
  record: Record<string, unknown>,
  field: string,
  context: string,
): number {
  const value = record[field]

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context} contient un nombre « ${field} » invalide.`)
  }

  return value
}

export function readNullableNumber(
  record: Record<string, unknown>,
  field: string,
  context: string,
): number | null {
  if (record[field] === null) {
    return null
  }

  return readNumber(record, field, context)
}

export function readArray(
  record: Record<string, unknown>,
  field: string,
  context: string,
): unknown[] {
  const value = record[field]

  if (!Array.isArray(value)) {
    throw new Error(`${context} contient une liste « ${field} » invalide.`)
  }

  return value
}

export function readDateTime(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const value = readString(record, field, context)

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${context} contient une date « ${field} » invalide.`)
  }

  return value
}

export function readNullableDateTime(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string | null {
  const value = readNullableString(record, field, context)

  if (value !== null && Number.isNaN(Date.parse(value))) {
    throw new Error(`${context} contient une date « ${field} » invalide.`)
  }

  return value
}

export function readNullableDate(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string | null {
  const value = readNullableString(record, field, context)

  if (value !== null && !DATE_PATTERN.test(value)) {
    throw new Error(`${context} contient une date « ${field} » invalide.`)
  }

  return value
}
