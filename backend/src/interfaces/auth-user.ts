export interface AuthUser {
  id: number;
  name: string;
  email: string;
  superUserId: number;
  role: 'SUPER' | 'SUB';
}
