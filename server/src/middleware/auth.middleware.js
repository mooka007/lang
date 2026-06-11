import { getUserById, verifyToken } from "../services/auth.service.js";

export async function requireAuth(request, _response, next) {
  try {
    const header = request.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token);

    if (!payload) {
      const error = new Error("Authentication required.");
      error.status = 401;
      throw error;
    }

    const user = await getUserById(payload.sub);
    if (!user) {
      const error = new Error("User account no longer exists.");
      error.status = 401;
      throw error;
    }

    request.user = user;
    next();
  } catch (error) {
    next(error);
  }
}
