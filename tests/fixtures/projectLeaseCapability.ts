/** Recognize only an actual host socket-listen permission denial, retaining other failures. */
export const projectLeaseListenDenial = (
  failure: unknown,
): string | undefined => {
  const seen = new Set<unknown>();
  for (
    let cause = failure;
    cause instanceof Error && !seen.has(cause);
    cause = cause.cause
  ) {
    seen.add(cause);
    const code = Reflect.get(cause, "code");
    if (
      Reflect.get(cause, "syscall") === "listen" &&
      (code === "EPERM" || code === "EACCES")
    )
      return code;
  }
  return undefined;
};
