import { dbAdmin } from '@/lib/firebaseAdmin';

type AuditAction =
	| 'patients-import'
	| 'patients-export'
	| 'user-reset-password'
	| 'billing-send-notifications';

interface AuditPayload {
	action: AuditAction;
	userId?: string;
	userEmail?: string;
	resourceType?: string;
	resourceId?: string;
	metadata?: Record<string, unknown>;
}

export async function logAudit(payload: AuditPayload): Promise<void> {
	try {
		await dbAdmin.collection('auditLogs').add({
			action: payload.action,
			userId: payload.userId || null,
			userEmail: payload.userEmail || null,
			resourceType: payload.resourceType || null,
			resourceId: payload.resourceId || null,
			metadata: payload.metadata || {},
			createdAt: new Date().toISOString(),
		});
	} catch (err) {
		// Do not throw; avoid breaking main flows if logging fails
		console.error('audit log failed', err);
	}
}


