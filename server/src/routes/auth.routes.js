import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { loginUser, registerUser } from "../services/auth.service.js";

export const authRouter = express.Router();

authRouter.post("/register", async (request, response, next) => {
  try {
    const result = await registerUser({
      name: request.body?.name,
      email: request.body?.email,
      password: request.body?.password
    });
    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (request, response, next) => {
  try {
    response.json(
      await loginUser({
        email: request.body?.email,
        password: request.body?.password
      })
    );
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, (request, response) => {
  response.json({
    user: request.user
  });
});
