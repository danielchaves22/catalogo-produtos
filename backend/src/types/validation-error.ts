export class ValidationError extends Error {
  details: Array<{ field: string; message: string }>;

  constructor(
    details: Record<string, string> | Array<{ field: string; message: string }>,
    message = 'Erros de valida\u00e7\u00e3o'
  ) {
    const arr = Array.isArray(details)
      ? details
      : Object.entries(details).map(([field, message]) => ({ field, message }));
    super(message);
    this.details = arr;
  }
}
