import { AuthUser } from "../../interfaces/auth-user";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
