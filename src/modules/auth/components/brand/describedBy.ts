/** Joins ids for `aria-describedby`, dropping empty ones; undefined when none are left. */
export const describedBy = (...ids: Array<string | false | null | undefined>): string | undefined => {
  const list = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  return list.length ? list.join(' ') : undefined;
};
