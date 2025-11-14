import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateRecurringDates } from '@/lib/appointmentUtils';

export async function POST(req: Request) {
	try {
		const session = await auth();
		if (!session) {
			return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
		}

		const body = await req.json();
		const {
			patientId,
			patient,
			doctor,
			startDate,
			time,
			frequency,
			count,
			notes,
		} = body;

		if (!patientId || !patient || !doctor || !startDate || !time || !frequency || !count) {
			return NextResponse.json(
				{
					success: false,
					message: 'Missing required fields: patientId, patient, doctor, startDate, time, frequency, count',
				},
				{ status: 400 }
			);
		}

		if (!['daily', 'weekly', 'biweekly', 'monthly'].includes(frequency)) {
			return NextResponse.json(
				{ success: false, message: 'Invalid frequency. Must be: daily, weekly, biweekly, or monthly' },
				{ status: 400 }
			);
		}

		// Generate recurring dates
		const dates = generateRecurringDates(startDate, frequency, count);

		// Create appointments
		const appointments = dates.map(date => ({
			patientId,
			patient,
			doctor,
			date,
			time,
			status: 'pending',
			notes: notes || null,
			createdAt: serverTimestamp(),
			isRecurring: true,
			recurringSeriesId: `${patientId}-${startDate}-${Date.now()}`,
		}));

		// Batch create appointments
		const createdAppointments = [];
		for (const appointment of appointments) {
			const docRef = await addDoc(collection(db, 'appointments'), appointment);
			createdAppointments.push({ id: docRef.id, ...appointment });
		}

		return NextResponse.json({
			success: true,
			data: {
				count: createdAppointments.length,
				appointments: createdAppointments,
			},
		});
	} catch (error) {
		console.error('Error creating recurring appointments:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to create recurring appointments' },
			{ status: 500 }
		);
	}
}

