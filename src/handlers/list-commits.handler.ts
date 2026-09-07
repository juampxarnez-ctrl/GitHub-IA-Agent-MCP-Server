import { listCommitsSchema } from "../schemas/list-commits-schema.js";
import { getRepositoryCommits } from "../github/operations.js";
import { ValidationError } from "../errors/app-errors.js";
import { mapGitHubError } from "../errors/map-github-error.js";

export async function listCommitsHandler(input: unknown) {
    const parsed = listCommitsSchema.safeParse(input);
    if (!parsed.success) {
        throw new ValidationError(
            "Los parámetros para listar el historial no son válidos.",
            { issues: parsed.error.issues }
        );
    }

    try {
        return await getRepositoryCommits(parsed.data.owner, parsed.data.repo, {
            branch: parsed.data.branch,
            perPage: parsed.data.per_page,
        });
    } catch (err) {
        throw mapGitHubError(err, { owner: parsed.data.owner, repo: parsed.data.repo });
    }
}
