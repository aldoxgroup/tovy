import prisma from "./database";
import type { NextApiRequest, NextApiResponse, NextApiHandler, GetServerSidePropsContext } from 'next'
import { withSessionRoute, withSessionSsr } from '@/lib/withSession'
import * as noblox from 'noblox.js'

type MiddlewareData = {
	handler: NextApiHandler
	next: any
	permissions: string
}

export function withPermissionCheck(
	handler: NextApiHandler,
	permission?: string
) {
	return withSessionRoute(async (req: NextApiRequest, res: NextApiResponse) => {
		const uid = req.session.userid;
		if (!uid) return res.status(401).json({ success: false, error: 'Unauthorized' });
		if (!req.query.id) return res.status(400).json({ success: false, error: 'Missing required fields' });
		const workspaceId = parseInt(req.query.id as string);
		

		const user = await prisma.user.findFirst({
			where: {
				userid: BigInt(uid)
			},
			include: {
				roles: true
			}
		});
		if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
		const userrole = user.roles.find(role => role.workspaceGroupId === workspaceId);
		if (!userrole) return res.status(401).json({ success: false, error: 'Unauthorized' });
		if (userrole.isOwnerRole) return handler(req, res);
		if (!permission) return handler(req, res);
		if (userrole.permissions.includes(permission)) return handler(req, res);
		return res.status(401).json({ success: false, error: 'Unauthorized' });
	})
}

export function withPermissionCheckSsr(
	handler: (context: GetServerSidePropsContext) => Promise<any>,
	permission?: string
) {
	return withSessionSsr(async (context) => {
		const {req, res, query} = context;
		const uid = req.session.userid;
		if (!uid) return {
			redirect: {
				destination: '/',
			}
		}
		if (!query.id) return {
			redirect: {
				destination: '/',
			}
		};
		const workspaceId = parseInt(query.id as string);
		

		const user = await prisma.user.findFirst({
			where: {
				userid: BigInt(uid)
			},
			include: {
				roles: true
			}
		});
		if (!user) return {
			redirect: {
				destination: '/',
			}
		}
		const userrole = user.roles.find(role => role.workspaceGroupId === workspaceId);
		if (!userrole) return {
			redirect: {	
				destination: '/',
			}
		};
		if (userrole.isOwnerRole) return handler(context);
		if (!permission) return handler(context);
		if (userrole.permissions.includes(permission)) return handler(context);
		return {
			redirect: {
				destination: '/',
			}
		}
	})
}



export async function checkGroupRoles(groupID: number) {
	const roles = await prisma.role.findMany({
		where: {
			workspaceGroupId: groupID
		}
	});
	for (const role of roles) {
		if (!role.groupRoles?.length) continue;
		const members = await noblox.getPlayers(groupID, role.groupRoles).catch(() => null);
		if (!members) continue;

		const users = await prisma.user.findMany({
			where: {
				roles: {
					some: {
						id: role.id
					}
				}
			}
		});
		for (const user of users) {
			if (!members.find(member => member.userId === Number(user.userid))) {
				await prisma.user.update({
					where: {
						userid: user.userid
					},
					data: {
						roles: {
							disconnect: {
								id: role.id
							}
						}
					}
				});
			}
		};

		for (const member of members) {
			console.log(member.userId)
			await prisma.user.upsert({
				where: {
					userid: member.userId
				},
				create: {
					userid: member.userId,
					roles: {
						connect: {
							id: role.id
						}
					}
				},
				update: {
					roles: {
						connect: {
							id: role.id
						}
					}
				}
			});
		};
	}
}
