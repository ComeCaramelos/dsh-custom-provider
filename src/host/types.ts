/**
 * Host half — shared types.
 *
 * Structural only: no cordis value import in this package (bundle purity), so
 * the host-context surface this half never uses is described by shape.
 */

/** A host-context dispose function (structural — no cordis value import here). */
export type Dispose = () => void;

/** The slice of the host context this half consumes: none. */
export type HostContext = Record<string, unknown>;
