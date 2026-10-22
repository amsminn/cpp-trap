export function buildSource(text: string, input: string): string {
  return text.replace("/*INPUT*/", input);
}
