import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { addTeamMember, createTeam, listTeams } from "../services/team.service.js";

export const teamsRouter = express.Router();
teamsRouter.use(requireAuth);

teamsRouter.get("/", async (request, response, next) => {
  try {
    response.json({
      teams: await listTeams(request.user)
    });
  } catch (error) {
    next(error);
  }
});

teamsRouter.post("/", async (request, response, next) => {
  try {
    const team = await createTeam({
      name: request.body?.name,
      user: request.user
    });
    response.status(201).json({
      team
    });
  } catch (error) {
    next(error);
  }
});

teamsRouter.post("/:teamId/members", async (request, response, next) => {
  try {
    const team = await addTeamMember({
      teamId: request.params.teamId,
      email: request.body?.email,
      role: request.body?.role,
      user: request.user
    });
    response.json({
      team
    });
  } catch (error) {
    next(error);
  }
});
