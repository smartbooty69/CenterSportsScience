import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, type QuerySnapshot, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendEmailNotification } from '@/lib/email';
import { sendSMSNotification, isValidPhoneNumber } from '@/lib/sms';
import { requireRole } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

interface BillingRecord {
	id: string;
	billingId: string;
	patientId: string;
	patient: string;
	amount: number;
	date: string;
	status: 'Pending' | 'Completed';
	appointmentId?: string;
	notificationSent?: boolean;
	lastNotificationSent?: Timestamp | Date | string | null;
}

interface PatientRecord {
	id: string;
	patientId: string;
	name: string;
	email?: string;
	phone?: string;
}

/**
 * API endpoint to send billing notifications for pending bills
 * 
 * Usage:
 * - GET /api/billing/notifications - Send notifications for all pending bills
 * - Optional query param: ?days=X to only notify bills older than X days (default: 3)
 */
export async function GET(request: NextRequest) {
	// Allow Admin and FrontDesk to trigger notifications
	const gate = await requireRole(request, ['Admin', 'FrontDesk']);
	if (!gate.ok) {
		return NextResponse.json({ error: gate.message }, { status: gate.status });
	}
	try {
		const searchParams = request.nextUrl.searchParams;
		const daysParam = searchParams.get('days');
		const daysThreshold = daysParam ? parseInt(daysParam, 10) : 3; // Default: notify bills older than 3 days

		if (isNaN(daysThreshold) || daysThreshold < 0) {
			return NextResponse.json(
				{ error: 'Invalid days parameter. Must be a non-negative number.' },
				{ status: 400 }
			);
		}

		// Calculate cutoff date
		const cutoffDate = new Date();
		cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
		const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

		// Query pending billing records
		const billingRef = collection(db, 'billing');
		const billingQuery = query(
			billingRef,
			where('status', '==', 'Pending')
		);

		const billingSnapshot = await getDocs(billingQuery);
		const pendingBills = billingSnapshot.docs.map(docSnap => {
			const data = docSnap.data();
			const lastNotification = (data.lastNotificationSent as Timestamp | undefined)?.toDate?.();
			return {
				id: docSnap.id,
				billingId: data.billingId ? String(data.billingId) : '',
				patientId: data.patientId ? String(data.patientId) : '',
				patient: data.patient ? String(data.patient) : '',
				amount: data.amount ? Number(data.amount) : 0,
				date: data.date ? String(data.date) : '',
				status: (data.status as 'Pending' | 'Completed') || 'Pending',
				appointmentId: data.appointmentId ? String(data.appointmentId) : undefined,
				notificationSent: data.notificationSent === true,
				lastNotificationSent: lastNotification ? lastNotification.toISOString() : null,
			} as BillingRecord;
		});

		// Filter bills older than threshold
		const billsToNotify = pendingBills.filter(bill => {
			const billDate = new Date(bill.date);
			return billDate <= cutoffDate;
		});

		if (billsToNotify.length === 0) {
			const result = {
				success: true,
				message: `No pending bills found older than ${daysThreshold} days`,
				notificationsSent: 0,
				billsChecked: pendingBills.length,
			};
			await logAudit({
				action: 'billing-send-notifications',
				userId: (gate as any).uid,
				resourceType: 'billing',
				metadata: { billsChecked: pendingBills.length, notified: 0, daysThreshold },
			});
			return NextResponse.json(result);
		}

		// Get unique patient IDs
		const patientIds = [...new Set(billsToNotify.map(bill => bill.patientId).filter(Boolean))];

		// Fetch all patients at once
		const patientsMap = new Map<string, PatientRecord>();
		if (patientIds.length > 0) {
			const patientsRef = collection(db, 'patients');
			for (const patientId of patientIds) {
				const patientQuery = query(patientsRef, where('patientId', '==', patientId));
				const patientSnapshot = await getDocs(patientQuery);
				if (!patientSnapshot.empty) {
					const patientData = patientSnapshot.docs[0].data();
					patientsMap.set(patientId, {
						id: patientSnapshot.docs[0].id,
						patientId: patientData.patientId ? String(patientData.patientId) : '',
						name: patientData.name ? String(patientData.name) : '',
						email: patientData.email ? String(patientData.email) : undefined,
						phone: patientData.phone ? String(patientData.phone) : undefined,
					});
				}
			}
		}

		// Send notifications
		let emailsSent = 0;
		let smsSent = 0;
		let errors: string[] = [];

		for (const bill of billsToNotify) {
			const patient = patientsMap.get(bill.patientId);
			if (!patient) {
				errors.push(`Patient not found for bill ${bill.billingId}`);
				continue;
			}

			// Send email notification
			if (patient.email) {
				try {
					const emailResult = await sendEmailNotification({
						to: patient.email,
						subject: `Pending Payment Reminder - ${bill.amount.toFixed(2)}`,
						template: 'billing-pending',
						data: {
							patientName: bill.patient || patient.name,
							patientEmail: patient.email,
							patientId: bill.patientId,
							billingId: bill.billingId,
							amount: bill.amount,
							date: bill.date,
							appointmentId: bill.appointmentId,
						},
					});
					if (emailResult.success) {
						emailsSent++;
					} else {
						errors.push(`Failed to send email for bill ${bill.billingId}: ${emailResult.error}`);
					}
				} catch (error) {
					console.error(`Failed to send email for bill ${bill.billingId}:`, error);
					errors.push(`Email error for bill ${bill.billingId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}

			// Send SMS notification
			if (patient.phone && isValidPhoneNumber(patient.phone)) {
				try {
					const smsResult = await sendSMSNotification({
						to: patient.phone,
						template: 'billing-pending',
						data: {
							patientName: bill.patient || patient.name,
							patientPhone: patient.phone,
							patientId: bill.patientId,
							billingId: bill.billingId,
							amount: bill.amount,
							date: bill.date,
						},
					});
					if (smsResult.success) {
						smsSent++;
					} else {
						errors.push(`Failed to send SMS for bill ${bill.billingId}: ${smsResult.error}`);
					}
				} catch (error) {
					console.error(`Failed to send SMS for bill ${bill.billingId}:`, error);
					errors.push(`SMS error for bill ${bill.billingId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			}
		}

		const response = {
			success: true,
			message: `Billing notifications sent`,
			billsChecked: pendingBills.length,
			billsNotified: billsToNotify.length,
			emailsSent,
			smsSent,
			errors: errors.length > 0 ? errors : undefined,
		};
		await logAudit({
			action: 'billing-send-notifications',
			userId: (gate as any).uid,
			resourceType: 'billing',
			metadata: {
				billsChecked: pendingBills.length,
				billsNotified: billsToNotify.length,
				emailsSent,
				smsSent,
				daysThreshold,
				errorCount: errors.length,
			},
		});
		return NextResponse.json(response);
	} catch (error) {
		console.error('Failed to send billing notifications:', error);
		return NextResponse.json(
			{
				success: false,
				message: 'Failed to send billing notifications',
				error: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
}

