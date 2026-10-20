export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDataError';
  }
}

export class CorruptDataError extends Error {
  readonly preservedAt: string;
  constructor(message: string, preservedAt: string) {
    super(message);
    this.name = 'CorruptDataError';
    this.preservedAt = preservedAt;
  }
}
