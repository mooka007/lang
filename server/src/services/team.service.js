import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { createActivity, listActivity } from "./activity.service.js";

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  return ["admin", "member"].includes(role) ? role : "member";
}

function mapInvite(invite) {
  return {
    id: invite.id,
    teamId: invite.teamId,
    teamName: invite.team?.name,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    createdAt: invite.createdAt instanceof Date ? invite.createdAt.toISOString() : invite.createdAt,
    acceptedAt: invite.acceptedAt instanceof Date ? invite.acceptedAt.toISOString() : invite.acceptedAt
  };
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
    ,
    invites:
      team.invites
        ?.filter((invite) => invite.status === "pending")
        .map(mapInvite) || []
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

async function getTeamForResponse(teamId) {
  return prisma.team.findUnique({
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
      },
      invites: {
        orderBy: {
          createdAt: "desc"
        }
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
      },
      invites: {
        orderBy: {
          createdAt: "desc"
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
      },
      invites: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  await createActivity({
    actor: user,
    action: "team.created",
    entityType: "team",
    entityId: team.id,
    message: `Created team ${team.name}.`
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

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    const error = new Error("Member email is required.");
    error.status = 400;
    throw error;
  }

  const targetUser = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    }
  });

  if (!targetUser) {
    await prisma.teamInvite.upsert({
      where: {
        teamId_email: {
          teamId,
          email: normalizedEmail
        }
      },
      update: {
        role: normalizeRole(role),
        status: "pending",
        invitedById: user.id,
        acceptedAt: null
      },
      create: {
        id: createId("invite"),
        teamId,
        email: normalizedEmail,
        role: normalizeRole(role),
        invitedById: user.id
      }
    });

    await createActivity({
      actor: user,
      action: "team.invite.created",
      entityType: "team",
      entityId: teamId,
      message: `Invited ${normalizedEmail}.`,
      metadata: {
        email: normalizedEmail,
        role: normalizeRole(role)
      }
    });

    return mapTeam(await getTeamForResponse(teamId));
  }

  await prisma.$transaction([
    prisma.teamMember.upsert({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUser.id
        }
      },
      update: {
        role: normalizeRole(role)
      },
      create: {
        id: createId("member"),
        teamId,
        userId: targetUser.id,
        role: normalizeRole(role)
      }
    }),
    prisma.teamInvite.updateMany({
      where: {
        teamId,
        email: normalizedEmail
      },
      data: {
        status: "accepted",
        acceptedAt: new Date()
      }
    })
  ]);

  await createActivity({
    actor: user,
    action: "team.member.added",
    entityType: "team",
    entityId: teamId,
    message: `Added ${targetUser.email} to the team.`,
    metadata: {
      userId: targetUser.id,
      email: targetUser.email,
      role: normalizeRole(role)
    }
  });

  return mapTeam(await getTeamForResponse(teamId));
}

export async function listPendingInvites(user) {
  const invites = await prisma.teamInvite.findMany({
    where: {
      email: normalizeEmail(user.email),
      status: "pending"
    },
    include: {
      team: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return invites.map(mapInvite);
}

export async function listTeamActivity({ teamId, user }) {
  if (!(await canUseTeam(teamId, user))) {
    const error = new Error("You do not have permission to view this team.");
    error.status = 403;
    throw error;
  }

  return listActivity({
    entityType: "team",
    entityId: teamId,
    limit: 30
  });
}

export async function cancelTeamInvite({ teamId, inviteId, user }) {
  if (!(await canManageTeam(teamId, user))) {
    const error = new Error("You do not have permission to manage this team.");
    error.status = 403;
    throw error;
  }

  const invite = await prisma.teamInvite.findFirst({
    where: {
      id: inviteId,
      teamId,
      status: "pending"
    }
  });

  if (!invite) {
    const error = new Error("Pending invitation not found.");
    error.status = 404;
    throw error;
  }

  await prisma.teamInvite.update({
    where: {
      id: invite.id
    },
    data: {
      status: "canceled"
    }
  });

  await createActivity({
    actor: user,
    action: "team.invite.canceled",
    entityType: "team",
    entityId: teamId,
    message: `Canceled invitation for ${invite.email}.`,
    metadata: {
      inviteId: invite.id,
      email: invite.email
    }
  });

  return mapTeam(await getTeamForResponse(teamId));
}

export async function acceptTeamInvite({ inviteId, user }) {
  const invite = await prisma.teamInvite.findUnique({
    where: {
      id: inviteId
    }
  });

  if (!invite || invite.status !== "pending" || invite.email !== normalizeEmail(user.email)) {
    const error = new Error("Invitation not found.");
    error.status = 404;
    throw error;
  }

  await prisma.$transaction([
    prisma.teamMember.upsert({
      where: {
        teamId_userId: {
          teamId: invite.teamId,
          userId: user.id
        }
      },
      update: {
        role: normalizeRole(invite.role)
      },
      create: {
        id: createId("member"),
        teamId: invite.teamId,
        userId: user.id,
        role: normalizeRole(invite.role)
      }
    }),
    prisma.teamInvite.update({
      where: {
        id: invite.id
      },
      data: {
        status: "accepted",
        acceptedAt: new Date()
      }
    })
  ]);

  await createActivity({
    actor: user,
    action: "team.invite.accepted",
    entityType: "team",
    entityId: invite.teamId,
    message: `${user.email} accepted the invitation.`,
    metadata: {
      inviteId: invite.id,
      email: user.email,
      role: normalizeRole(invite.role)
    }
  });

  return mapTeam(await getTeamForResponse(invite.teamId));
}

export async function removeTeamMember({ teamId, userId, user }) {
  if (!(await canManageTeam(teamId, user))) {
    const error = new Error("You do not have permission to manage this team.");
    error.status = 403;
    throw error;
  }

  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId,
        userId
      }
    }
  });

  if (!membership) {
    const error = new Error("Member not found.");
    error.status = 404;
    throw error;
  }

  if (membership.role === "owner") {
    const error = new Error("The team owner cannot be removed.");
    error.status = 400;
    throw error;
  }

  await prisma.teamMember.delete({
    where: {
      teamId_userId: {
        teamId,
        userId
      }
    }
  });

  await createActivity({
    actor: user,
    action: "team.member.removed",
    entityType: "team",
    entityId: teamId,
    message: "Removed a member from the team.",
    metadata: {
      userId
    }
  });

  return mapTeam(await getTeamForResponse(teamId));
}
