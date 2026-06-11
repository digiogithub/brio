export function getFieldsFromTemplate(template: string | null): string[] {
  if (template === null) return [];

  const regex = /{{([^}]+)}}/g;
  const fields: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    fields.push(match[1]!.trim());
  }

  return fields;
}
