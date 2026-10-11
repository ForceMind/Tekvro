/** Human-only localization: do not change machine-readable CLI JSON or MCP IDs. */
export type CliLocaleEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * TEKVRO_LANG explicitly overrides LANG; zh, zh-CN, zh_CN and zh-Hans are
 * all accepted. An unsupported or empty language keeps English help.
 */
export const isChineseLocale = (
  environment: CliLocaleEnvironment = process.env,
): boolean =>
  /^zh(?:[-_]|$)/iu.test(
    (environment.TEKVRO_LANG ?? environment.LANG ?? "").trim(),
  );

export const selectHumanText = (
  english: string,
  chinese: string,
  environment: CliLocaleEnvironment = process.env,
): string => (isChineseLocale(environment) ? chinese : english);
