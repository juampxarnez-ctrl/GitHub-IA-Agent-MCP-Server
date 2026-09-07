import { revertToCommitSchema } from "../schemas/revert-to-commit-schema.js";
import { revertToCommit } from "../github/operations.js";
import { ValidationError } from "../errors/app-errors.js";
import { mapGitHubError } from "../errors/map-github-error.js";

export async function revertToCommitHandler(input: unknown) {
    const parsed = revertToCommitSchema.safeParse(input);
    if (!parsed.success) {
        throw new ValidationError(
            "Los datos para volver a un commit anterior no son válidos.",
            { issues: parsed.error.issues }
        );
    }

    try {
        return await revertToCommit(parsed.data);
    } catch (err) {
        // El recurso que puede no existir acá es tanto el repo como el commit,
        // así que damos el contexto más específico posible para el mensaje 404.
        throw mapGitHubError(err, {
            owner: parsed.data.owner,
            repo: parsed.data.repo,
            resource: `${parsed.data.owner}/${parsed.data.repo}@${parsed.data.sha}`,
        });
    }
}
