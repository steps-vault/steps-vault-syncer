/** Joins the class names that are set, so optional modifiers read as one expression. */
export function joinClassNames(...classNames: readonly (string | false | null | undefined)[]): string {
  return classNames.filter(Boolean).join(' ');
}
