import { doc, runTransaction } from 'firebase/firestore';

import { db } from './firebase';
import {
	createInitialSessionAllowance,
	getRemainingFreeSessions,
	normalizeSessionAllowance,
	refreshSessionAllowanceIfNeeded,
} from './sessionAllowance';
import type { SessionAllowance } from './types';

export interface RecordSessionUsageInput {
	patientDocId: string;
	patientType?: string;
	appointmentId: string;
	sessionCost?: number;
	now?: Date;
}

export interface RecordSessionUsageResult {
	wasFree: boolean;
	allowance: SessionAllowance;
	remainingFreeSessions: number;
}

export async function recordSessionUsageForAppointment({
	patientDocId,
	patientType,
	appointmentId,
	sessionCost = 0,
	now = new Date(),
}: RecordSessionUsageInput): Promise<RecordSessionUsageResult | null> {
	if (!patientDocId || patientType !== 'DYES') {
		return null;
	}

	const normalizedCost = Number.isFinite(sessionCost) ? Number(sessionCost) : 0;

	return runTransaction(db, async transaction => {
		const patientRef = doc(db, 'patients', patientDocId);
		const patientSnap = await transaction.get(patientRef);
		if (!patientSnap.exists()) {
			throw new Error('Patient not found while recording session usage.');
		}

		const patientData = patientSnap.data() as Record<string, unknown>;
		const allowanceRaw = patientData.sessionAllowance as Partial<SessionAllowance> | undefined;

		let allowance = allowanceRaw
			? normalizeSessionAllowance(allowanceRaw, now)
			: createInitialSessionAllowance(now);

		const { allowance: refreshedAllowance } = refreshSessionAllowanceIfNeeded(allowance, now);
		allowance = refreshedAllowance;

		let wasFree = false;
		if (allowance.freeSessionsUsed < allowance.annualFreeSessionCap) {
			allowance.freeSessionsUsed += 1;
			wasFree = true;
		} else {
			allowance.pendingPaidSessions += 1;
			if (normalizedCost > 0) {
				allowance.pendingChargeAmount = Number(
					(allowance.pendingChargeAmount ?? 0) + normalizedCost
				);
			}
		}

		allowance.lastUpdatedAt = now.toISOString();

		transaction.update(patientRef, {
			sessionAllowance: allowance,
			updatedAt: now.toISOString(),
			lastSessionCompletedAt: now.toISOString(),
			lastCompletedAppointmentId: appointmentId,
		});

		return {
			wasFree,
			allowance,
			remainingFreeSessions: getRemainingFreeSessions(allowance),
		};
	});
}

