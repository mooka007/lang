import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function mapTeam(team) {
  return {
    id: team.id,
    name: team.name,
    ownerId: team.ownerId,
    createdAt: team.createdAt instanceof Date ? team.createdAt.toISOString() : team.createdAt,
    members:
      team.members?.map((member) => ({
        id: member.id,
        role: member.role,
        userId: member.userId,
        name: member.user?.name,
        email: member.user?.email
      })) || []
  };
}

async function getMembership(teamId, userId) {
  return prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId
      }
    }
  });
}

export async function listTeams(user) {
  const teams = await prisma.team.findMany({
    where:
      user.role === "admin"
        ? undefined
        : {
            members: {
              some: {
                userId: user.id
              }
            }
          },
    orderBy: {
      createdAt: "desc"
    },
    include: {
      members: {
        include: {
          user: true
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return teams.map(mapTeam);
}

export async function createTeam({ name, user }) {
  const teamName = String(name || "").trim();
  if (!teamName) {
    const error = new Error("Team name is required.");
    error.status = 400;
    throw error;
  }

  const team = await prisma.team.create({
    data: {
      id: createId("team"),
      name: teamName,
      ownerId: user.id,
      members: {
        create: {
          id: createId("member"),
          userId: user.id,
          role: "owner"
        }
      }
    },
    include: {
      members: {
        include: {
          user: true
        }
      }
    }
  });

  return mapTeam(team);
}

export async function canManageTeam(teamId, user) {
  if (user.role === "admin") {
    return true;
  }

  const membership = await getMembership(teamId, user.id);
  return ["owner", "admin"].includes(membership?.role);
}

export async function canUseTeam(teamId, user) {
  if (!teamId) {
    return false;
  }

  if (user.role === "admin") {
    return true;
  }

  return Boolean(await getMembership(teamId, user.id));
}

export async function addTeamMember({ teamId, email, role = "member", user }) {
  if (!(await canManageTeam(teamId, user))) {
    const error = new Error("You do not have permission to manage this team.");
    error.status = 403;
    throw error;
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      email: normalizeEmail(email)
    }
  });
  if (!targetUser) {
    const error = new Error("No user exists with that email.");
    error.status = 404;
    throw error;
  }

  await prisma.teamMember.upsert({
    where: {
      teamId_userId: {
        teamId,
        userId: targetUser.id
      }
    },
    update: {
      role: ["admin", "member"].includes(role) ? role : "member"
    },
    create: {
      id: createId("member"),
      teamId,
      userId: targetUser.id,
      role: ["admin", "member"].includes(role) ? role : "member"
    }
  });

  const team = await prisma.team.findUnique({
    where: {
      id: teamId
    },
    include: {
      members: {
        include: {
          user: true
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  return mapTeam(team);
}
