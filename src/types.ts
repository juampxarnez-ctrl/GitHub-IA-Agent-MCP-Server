
export interface RepositoryInfo {
    id: number;
    fullName: string
    description: string | null;
    stars: number;
    defaultBranch: string;
    url: string;
    language: string | null;
    visibility: string;
    createdAt: string;
    updatedAt: string;
}

export interface RepoSummary {
    id: number;
    fullName: string
    description: string | null;
    stars: number;
    defaultBranch: string;
    url: string;
}

export interface UserInfo {
    login: string;
    id: number;

    avatarUrl: string;
    htmlUrl: string;

    name: string | null;
    company: string | null;
    blog: string | null;
    location: string | null;
    email: string | null;
    bio: string | null;

    publicRepos: number;
    followers: number;
    following: number;

    createdAt: string;
    updatedAt: string;
}

export interface UserSummary {
    login: string;
    avatarUrl: string;
    name: string | null;
    publicRepos: number;
    followers: number;
    htmlUrl: string;
}

export interface CommitInfo {
    sha: string;

    message: string;

    author: {
        name: string | null;
        email: string | null;
        date: string;
    };

    url: string;
}

export interface CommitSummary {
    sha: string;
    message: string;
    author: string;
    date: string;
    url: string;
}

/** Resultado de volver el estado de una rama a un commit anterior. */
export interface RevertResult {
    /** false cuando la rama ya estaba en ese commit y no hizo falta hacer nada. */
    reverted: boolean;
    branch: string;
    /** Commit al que se quiso volver. */
    targetSha: string;
    /** Commit en el que estaba la rama antes de la operación. */
    previousHeadSha: string;
    /** Commit nuevo que restaura el estado (vacío si no hizo falta revertir). */
    newCommitSha: string;
    /** URL del commit nuevo (vacía si no hizo falta revertir). */
    newCommitUrl: string;
    /** Mensaje del commit de revert. */
    message: string;
}

export interface IssueInfo {
    number: number;
    title: string;
    body: string | null;

    state: "open" | "closed";

    author: string;

    createdAt: string;
    updatedAt: string;

    url: string;
}

export interface IssueSummary {
    number: number;
    title: string;
    state: "open" | "closed";
    url: string;
}


export interface PullRequestInfo {
    number: number;

    title: string;

    body: string | null;

    state: "open" | "closed";

    author: string;

    createdAt: string;
    updatedAt: string;

    url: string;
}

export interface PullRequestSummary {
    number: number;
    title: string;
    state: "open" | "closed";
    url: string;
}
export type ErrorCode =
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "AUTH_ERROR"
    | "RATE_LIMIT"
    | "INTERNAL_ERROR";

export interface ToolError {
    code: ErrorCode;

    message: string;

    documentationUrl?: string;
}




