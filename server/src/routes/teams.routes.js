import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import {
  acceptTeamInvite,
  addTeamMember,
  cancelTeamInvite,
  createTeam,
  listPendingInvites,
  listTeamActivity,
  listTeams,
  removeTeamMember
} from "../services/team.service.js";

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

teamsRouter.get("/invitations", async (request, response, next) => {
  try {
    response.json({
      invitations: await listPendingInvites(request.user)
    });
  } catch (error) {
    next(error);
  }
});

teamsRouter.post("/invitations/:inviteId/accept", async (request, response, next) => {
  try {
    const team = await acceptTeamInvite({
      inviteId: request.params.inviteId,
      user: request.user
    });

    response.json({
      team
    });
  } catch (error) {
    next(error);
  }
});

teamsRouter.get("/:teamId/activity", async (request, response, next) => {
  try {
    response.json({
      activity: await listTeamActivity({
        teamId: request.params.teamId,
        user: request.user
      })
    });
  } catch (error) {
    next(error);
  }
});

teamsRouter.delete("/:teamId/invitations/:inviteId", async (request, response, next) => {
  try {
    const team = await cancelTeamInvite({
      teamId: request.params.teamId,
      inviteId: request.params.inviteId,
      user: request.user
    });

    response.json({
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

teamsRouter.delete("/:teamId/members/:userId", async (request, response, next) => {
  try {
    const team = await removeTeamMember({
      teamId: request.params.teamId,
      userId: request.params.userId,
      user: request.user
    });

    response.json({
      team
    });
  } catch (error) {
    next(error);
  }
});
