export class InvalidDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDataError';
  }
}

export class NoProfileError extends Error {
  constructor() {
    super('No learner profile yet. Call set_profile first.');
    this.name = 'NoProfileError';
  }
}

export class ThemeRequiredError extends Error {
  constructor() {
    super("A theme is needed to create this week's plan. Provide a theme and try again.");
    this.name = 'ThemeRequiredError';
  }
}

export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`${what} not found: ${id}`);
    this.name = 'NotFoundError';
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
