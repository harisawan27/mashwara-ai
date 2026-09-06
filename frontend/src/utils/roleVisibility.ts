/**
 * Canonical visibility predicate for Mashwara AI deliberation experts.
 * Only the 6 contextual deliberation experts should be visibly rendered
 * in live expert cards, progress counts ("X / Y complete"), deliberation grids,
 * mobile canvases, and export participant listings.
 *
 * The Lead Advisor / Musheer is an internal synthesis role and must NOT
 * be rendered as a deliberation expert card.
 */
export function isVisibleExpert(
  role: { key?: string; role_id?: string; is_moderator?: boolean } | null | undefined
): boolean {
  if (!role) return false;
  const key = role.key || role.role_id || "";
  return key !== "Moderator" && key !== "lead_advisor" && !role.is_moderator;
}
