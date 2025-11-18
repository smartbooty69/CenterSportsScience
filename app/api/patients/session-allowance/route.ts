import { NextRequest, NextResponse } from 'next/server';

import { requireRole } from '@/lib/authz';
import { dbAdmin } from '@/lib/firebaseAdmin';
import {
	createInitialSessionAllowance,
	normalizeSessionAllowance,
	refreshSessionAllowanceIfNeeded,
} from '@/lib/sessionAllowance';

export async function POST(request: NextRequest) {
	const gate = await requireRole(request, ['Admin']);
	if (!gate.ok) {
		return NextResponse.json({ error: gate.message }, { status: gate.status });
	}

	try {
		const now = new Date();
		const snapshot = await dbAdmin.collection('patients').where('patientType', '==', 'DYES').get();

		let updatedCount = 0;
		let resetsApplied = 0;
		let initialized = 0;

		let batch = dbAdmin.batch();
		let batchSize = 0;

		for (const docSnap of snapshot.docs) {
			const data = docSnap.data() as Record<string, unknown>;
			const allowanceRaw = data.sessionAllowance as Record<string, unknown> | undefined;

			const normalized = allowanceRaw
				? normalizeSessionAllowance(allowanceRaw, now)
				: createInitialSessionAllowance(now);

			const { allowance: refreshed, resetsApplied: resetCount } = refreshSessionAllowanceIfNeeded(normalized, now);
			let needsUpdate = resetCount > 0;

			if (!allowanceRaw) {
				initialized += 1;
				needsUpdate = true;
			}

			if (needsUpdate) {
				batch.update(docSnap.ref, {
					sessionAllowance: refreshed,
				});
				updatedCount += 1;
				resetsApplied += resetCount;
				batchSize += 1;
			}

			if (batchSize >= 400) {
				await batch.commit();
				batch = dbAdmin.batch();
				batchSize = 0;
			}
		}

		if (batchSize > 0) {
			await batch.commit();
		}

		return NextResponse.json({
			success: true,
			dyesPatients: snapshot.size,
			recordsUpdated: updatedCount,
			resetsApplied,
			initialized,
		});
	} catch (error) {
		console.error('Failed to refresh DYES session allowances:', error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

