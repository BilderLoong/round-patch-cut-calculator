export const isFormEditingTag = (
  tagName: string,
  isContentEditable: boolean,
): boolean => {
  const normalizedTagName = tagName.toLowerCase();
  return (
    normalizedTagName === "input" ||
    normalizedTagName === "textarea" ||
    normalizedTagName === "select" ||
    isContentEditable
  );
};
