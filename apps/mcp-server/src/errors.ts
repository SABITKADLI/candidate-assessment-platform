export class ToolError extends Error {
  constructor(public code: string, message: string, public http = 400) {
    super(message);
  }
}

export function toToolResult(e: unknown) {
  if (e instanceof ToolError) {
    return { code: e.code, message: e.message };
  }
  return { code: 'internal', message: 'internal error' };
}
