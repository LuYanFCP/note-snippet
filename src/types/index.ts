export interface Post {
    id: number;
    title: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    user: User;
}

export interface User {
    id: number;
    login: string;
    avatarUrl: string;
}