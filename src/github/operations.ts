import { octokit } from "./client.js";
import { withRetry } from "../utils/retry.js";
import type {
    RepositoryInfo,
    RepoSummary,
    UserInfo,
    UserSummary,
    CommitInfo,
    CommitSummary,
    IssueSummary,
    IssueInfo,
    PullRequestSummary,
    PullRequestInfo,
    RevertResult,
} from "../types.js";

// repositories
export async function getRepository(
    owner: string,
    repo: string
): Promise<RepositoryInfo> {
    const response = await octokit.repos.get({
        owner,
        repo,
    });
    return {
        id: response.data.id,
        fullName: response.data.full_name,
        description: response.data.description,
        stars: response.data.stargazers_count,
        defaultBranch: response.data.default_branch,
        url: response.data.html_url,
        language: response.data.language,
        visibility: response.data.visibility ?? "unknown",
        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at,
    };
}

// create repository
export async function createRepository(input: {
    name: string;
    description?: string;
    private?: boolean;
}): Promise<RepoSummary> {
    const response = await withRetry(() =>
        octokit.repos.createForAuthenticatedUser({
            name: input.name,
            description: input.description,
            private: input.private,
        }),
        { context: { resource: input.name } }
    );

    return {
        id: response.data.id,
        fullName: response.data.full_name,
        description: response.data.description,
        stars: response.data.stargazers_count,
        defaultBranch: response.data.default_branch,
        url: response.data.html_url,
    };
}


// users-info-summary
export async function getUser(
    username: string
): Promise<UserInfo> {

    const response = await octokit.users.getByUsername({
        username,
    });

    return {
        login: response.data.login,
        id: response.data.id,

        avatarUrl: response.data.avatar_url,
        htmlUrl: response.data.html_url,

        name: response.data.name,
        company: response.data.company,
        blog: response.data.blog,
        location: response.data.location,
        email: response.data.email,
        bio: response.data.bio,

        publicRepos: response.data.public_repos,
        followers: response.data.followers,
        following: response.data.following,

        createdAt: response.data.created_at,
        updatedAt: response.data.updated_at,
    };
}

export async function getUserSummary(
    username: string
): Promise<UserSummary> {

    const response = await octokit.users.getByUsername({
        username,
    });

    return {
        login: response.data.login,
        avatarUrl: response.data.avatar_url,
        name: response.data.name,
        publicRepos: response.data.public_repos,
        followers: response.data.followers,
        htmlUrl: response.data.html_url,
    };
}


// commits-info-summary

export async function getRepositoryCommits(
    owner: string,
    repo: string,
    options: { branch?: string; perPage?: number } = {}
): Promise<CommitSummary[]> {

    const response = await withRetry(() =>
        octokit.repos.listCommits({
            owner,
            repo,
            // `sha` acepta el nombre de una rama; si no se pasa, GitHub usa la rama por defecto.
            sha: options.branch,
            per_page: options.perPage ?? 10,
        }),
        {
            context: {
                owner,
                repo,
                resource: options.branch
                    ? `${owner}/${repo} (rama ${options.branch})`
                    : undefined,
            },
        }
    );

    return response.data.map(commit => ({
        sha: commit.sha,

        message: commit.commit.message,

        author: commit.commit.author?.name ?? "Unknown",

        date: commit.commit.author?.date ?? "",

        url: commit.html_url,
    }));
}

export async function getCommit(
    owner: string,
    repo: string,
    sha: string
): Promise<CommitInfo> {

    const response = await octokit.repos.getCommit({
        owner,
        repo,
        ref: sha,
    });

    return {
        sha: response.data.sha,

        message: response.data.commit.message,

        author: {
            name: response.data.commit.author?.name ?? null,
            email: response.data.commit.author?.email ?? null,
            date: response.data.commit.author?.date ?? "",
        },

        url: response.data.html_url,
    };
}



// issues-info-summary

export async function getIssue(
    owner: string,
    repo: string,
    issueNumber: number
): Promise<IssueInfo> {

    const response = await octokit.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
    });

    return {
        number: response.data.number,

        title: response.data.title,

        body: response.data.body ?? null,

        state: response.data.state as "open" | "closed",

        author: response.data.user?.login ?? "unknown",

        createdAt: response.data.created_at,

        updatedAt: response.data.updated_at,

        url: response.data.html_url,
    };
}

export async function getRepositoryIssues(
    owner: string,
    repo: string,
    state: "open" | "closed" | "all" = "open"
): Promise<IssueSummary[]> {

    const response = await withRetry(() =>
        octokit.issues.listForRepo({
            owner,
            repo,
            per_page: 10,
            state,
        }),
        { context: { owner, repo } }
    );

    return response.data.map(issue => ({
        number: issue.number,
        title: issue.title,
        state: issue.state as "open" | "closed",
        url: issue.html_url,
    }));
}

// Pull requests-info-summary

export async function getRepositoryPullRequests(
    owner: string,
    repo: string
): Promise<PullRequestSummary[]> {

    const response = await octokit.pulls.list({
        owner,
        repo,
        state: "all",
        per_page: 10,
    });

    return response.data.map(pr => ({
        number: pr.number,
        title: pr.title,
        state: pr.state as "open" | "closed",
        url: pr.html_url,
    }));
}

export async function getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
): Promise<PullRequestInfo> {

    const response = await octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
    });

    return {
        number: response.data.number,

        title: response.data.title,

        body: response.data.body ?? null,

        state: response.data.state as "open" | "closed",

        author: response.data.user?.login ?? "unknown",

        createdAt: response.data.created_at,

        updatedAt: response.data.updated_at,

        url: response.data.html_url,
    };
}

// list repositories (del usuario autenticado)

export async function listRepositories(input: {
    visibility?: "all" | "public" | "private";
    sort?: "created" | "updated" | "pushed" | "full_name";
    per_page?: number;
}): Promise<RepoSummary[]> {
    const response = await withRetry(() =>
        octokit.repos.listForAuthenticatedUser({
            visibility: input.visibility ?? "all",
            sort: input.sort ?? "updated",
            per_page: input.per_page ?? 30,
        }),
        { context: { resource: "los repositorios de tu cuenta" } }
    );

    return response.data.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        description: repo.description,
        stars: repo.stargazers_count,
        defaultBranch: repo.default_branch,
        url: repo.html_url,
    }));
}

// create issue
export async function createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
}): Promise<IssueSummary> {
    const response = await withRetry(() =>
        octokit.issues.create({
            owner: input.owner,
            repo: input.repo,
            title: input.title,
            body: input.body,
        }),
        { context: { owner: input.owner, repo: input.repo } }
    );

    return {
        number: response.data.number,
        title: response.data.title,
        state: response.data.state as "open" | "closed",
        url: response.data.html_url,
    };
}

// create commit (agrega o modifica un archivo con el flujo de 6 pasos de Git)
export async function createCommit(input: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    content: string;
    message: string;
}): Promise<{ commitSha: string; commitUrl: string }> {
    const { owner, repo, branch, path, content, message } = input;

    // 1. Obtener la ref de la rama.
    const refResp = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
    });
    const baseCommitSha = refResp.data.object.sha;

    // 2. Obtener el tree base desde el commit actual.
    const baseCommit = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: baseCommitSha,
    });
    const baseTreeSha = baseCommit.data.tree.sha;

    // 3. Crear un blob con el contenido del archivo.
    const blob = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(content, "utf8").toString("base64"),
        encoding: "base64",
    });

    // 4. Crear un nuevo tree que incluya el blob.
    const newTree = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree: [
            {
                path,
                mode: "100644",
                type: "blob",
                sha: blob.data.sha,
            },
        ],
    });

    // 5. Crear el commit apuntando al nuevo tree.
    const newCommit = await octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.data.sha,
        parents: [baseCommitSha],
    });

    // 6. Actualizar la ref de la rama al nuevo commit.
    await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.data.sha,
    });

    return {
        commitSha: newCommit.data.sha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.data.sha}`,
    };
}

/**
 * Vuelve el contenido de una rama al estado de un commit anterior.
 *
 * NO reescribe la historia. En vez de mover la rama hacia atrás (lo que dejaría
 * commits huérfanos y rompería el repo de cualquiera que ya lo hubiera clonado),
 * crea un COMMIT NUEVO cuyo árbol de archivos es el del commit destino y cuyo
 * padre es el HEAD actual. El resultado es idéntico en contenido, el historial
 * queda intacto y la operación se puede deshacer revirtiendo otra vez.
 *
 *   antes:  A ── B ── C ── D (HEAD)
 *   después: A ── B ── C ── D ── E (HEAD, árbol de B)
 */
export async function revertToCommit(input: {
    owner: string;
    repo: string;
    branch: string;
    sha: string;
    message?: string;
}): Promise<RevertResult> {
    const { owner, repo, branch, sha } = input;

    // 1. HEAD actual de la rama.
    const refResp = await withRetry(() =>
        octokit.git.getRef({ owner, repo, ref: `heads/${branch}` }),
        { context: { owner, repo, resource: `${owner}/${repo} (rama ${branch})` } }
    );
    const headSha = refResp.data.object.sha;

    // 2. Commit destino: valida que exista y nos da su árbol de archivos.
    const targetCommit = await withRetry(() =>
        octokit.repos.getCommit({ owner, repo, ref: sha }),
        { context: { owner, repo, resource: `${owner}/${repo}@${sha}` } }
    );
    const targetSha = targetCommit.data.sha;
    const targetTreeSha = targetCommit.data.commit.tree.sha;

    // 3. Si la rama ya está en ese commit, no hay nada que hacer.
    //    Devolver esto en vez de crear un commit vacío evita ensuciar el historial.
    if (headSha === targetSha) {
        return {
            reverted: false,
            branch,
            targetSha,
            previousHeadSha: headSha,
            newCommitSha: "",
            newCommitUrl: "",
            message: `La rama "${branch}" ya está en el commit ${targetSha.slice(0, 7)}.`,
        };
    }

    const commitMessage =
        input.message ??
        `Revert: volver al estado del commit ${targetSha.slice(0, 7)}`;

    // 4. Commit nuevo: árbol del commit viejo, padre el HEAD actual.
    const newCommit = await withRetry(() =>
        octokit.git.createCommit({
            owner,
            repo,
            message: commitMessage,
            tree: targetTreeSha,
            parents: [headSha],
        }),
        { context: { owner, repo } }
    );

    // 5. Mover la rama al commit nuevo. Sin force: es un avance normal del historial.
    await withRetry(() =>
        octokit.git.updateRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            sha: newCommit.data.sha,
        }),
        { context: { owner, repo, resource: `${owner}/${repo} (rama ${branch})` } }
    );

    return {
        reverted: true,
        branch,
        targetSha,
        previousHeadSha: headSha,
        newCommitSha: newCommit.data.sha,
        newCommitUrl: `https://github.com/${owner}/${repo}/commit/${newCommit.data.sha}`,
        message: commitMessage,
    };
}

// health check: verifica que el token es válido y hay conexión con GitHub
export async function healthCheck(): Promise<{ status: string; user: string }> {
    const response = await withRetry(() => octokit.users.getAuthenticated(), {
        context: { resource: "el usuario autenticado" },
    });
    return {
        status: "ok",
        user: response.data.login,
    };
}


