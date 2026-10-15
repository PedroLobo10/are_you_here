/** Only bundled raster pages are accepted; arbitrary external markup is never rendered. */
export const isLocalQuestionPage = (value: unknown): value is string => typeof value === 'string' && /^\/question-pages\/[a-f0-9]{20}-p[1-9]\d*\.webp$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function validQuestionEvidence(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.keyVerification !== undefined && !['pdf-checked', 'public-transcription', 'user-recorded'].includes(String(value.keyVerification))) return false;
  if (value.sourceVerifiedAt !== undefined && (typeof value.sourceVerifiedAt !== 'string' || !Number.isFinite(Date.parse(value.sourceVerifiedAt)))) return false;
  if (value.sourceVerification !== undefined && typeof value.sourceVerification !== 'string') return false;
  if (value.yearBasis !== undefined && !['application', 'catalog-application'].includes(String(value.yearBasis))) return false;
  if (value.contentCurrentness !== undefined && !['not-revalidated', 'historical-statistic', 'version-specific'].includes(String(value.contentCurrentness))) return false;
  for (const key of ['answerKeySourceUrl', 'answerKeyEvidenceUrl']) {
    if (value[key] === undefined) continue;
    try { const parsed = new URL(String(value[key])); if (typeof value[key] !== 'string' || !['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return false; }
    catch { return false; }
  }
  if (value.originalPages === undefined) return true;
  if (!Array.isArray(value.originalPages) || value.originalPages.length < 1 || value.originalPages.length > 20) return false;
  const seen = new Set<string>();
  return value.originalPages.every(page => {
    if (!object(page) || !isLocalQuestionPage(page.assetUrl) || !Number.isInteger(page.page) || Number(page.page) < 1 || typeof page.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(page.sha256) || (page.support !== undefined && typeof page.support !== 'boolean') || seen.has(page.assetUrl)) return false;
    seen.add(page.assetUrl); return true;
  });
}
