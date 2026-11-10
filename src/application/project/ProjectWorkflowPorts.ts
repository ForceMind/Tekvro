import type { AnalysisError } from "../../domain/analysisErrorBase.js";
import type { ProjectBuilderResult } from "../../domain/projectBuilder.js";
import type { ProjectCheckBinding } from "../../domain/projectCheckBinding.js";
import type { ProjectRunRecord } from "../../domain/projectRun.js";
import type { Result } from "../../domain/result.js";

export type { ProjectBuilderResult } from "../../domain/projectBuilder.js";

/** A bounded builder request whose workspace and effective budget are already selected. */
export interface ProjectBuilderRequest {
  readonly run: ProjectRunRecord;
  readonly workspace: string;
  readonly instruction: string;
  readonly timeout_ms: number;
}

/** A producer observation, retained without interpreting prose as an acceptance result. */
export interface ProjectBuilderEvent {
  readonly kind: "progress" | "tool" | "message" | "session";
  readonly observed_at: string;
  readonly text: string;
  readonly session_id?: string;
}

/** Provider boundary for one explicitly selected builder; no implicit fallback or retry. */
export interface ProjectBuilderPort {
  readonly id: string;
  run(
    request: ProjectBuilderRequest,
    signal?: AbortSignal,
    onEvent?: (event: ProjectBuilderEvent) => void | Promise<void>,
  ): Promise<Result<ProjectBuilderResult, AnalysisError>>;
  /** Retry cleanup through the adapter's original resource owner before disposal. */
  close?(): Promise<void>;
}

/** One stored independent check, not an assertion of complete project acceptance. */
export interface ProjectValidationResult {
  readonly check_id: string;
  readonly binding: ProjectCheckBinding;
  readonly outcome: "pass" | "fail" | "unknown";
  readonly report_path: string;
  readonly report_sha256: string;
  readonly evidence_ids: readonly string[];
  readonly limitations: readonly string[];
}

/** Checks own their concrete input contract and persist a bound, inspectable report. */
export interface ProjectValidatorPort<Request> {
  run(
    request: Request,
    signal?: AbortSignal,
  ): Promise<Result<ProjectValidationResult, AnalysisError>>;
}
