import { problemDetailsSchema, type ProblemDetails } from "@nasir/shared";

type ProblemInit = Omit<ProblemDetails, "type"> & {
  slug: string;
  apiOrigin: string;
};

export function createProblemDetails(init: ProblemInit): ProblemDetails {
  return problemDetailsSchema.parse({
    ...init,
    type: `${init.apiOrigin.replace(/\/$/, "")}/problems/${init.slug}`
  });
}

