import { NextResponse } from 'next/server';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { checkAppointmentConflict } from '@/lib/appointmentUtils';

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { doctor, date, time, duration, appointmentId } = body;

		if (!doctor || !date || !time) {
			return NextResponse.json(
				{ success: false, message: 'Missing required fields: doctor, date, time' },
				{ status: 400 }
			);
		}

		// Fetch all appointments for this doctor on this date
		const appointmentsQuery = query(
			collection(db, 'appointments'),
			where('doctor', '==', doctor),
			where('date', '==', date)
		);

		const snapshot = await getDocs(appointmentsQuery);
		const appointments = snapshot.docs.map(doc => ({
			id: doc.id,
			appointmentId: doc.data().appointmentId,
			patient: doc.data().patient || '',
			doctor: doc.data().doctor || '',
			date: doc.data().date || '',
			time: doc.data().time || '',
			status: doc.data().status || 'pending',
		}));

		const conflict = checkAppointmentConflict(
			appointments,
			{
				id: appointmentId,
				doctor,
				date,
				time,
				duration: duration || 30,
			},
			duration || 30
		);

		return NextResponse.json({ success: true, data: conflict });
	} catch (error) {
		console.error('Error checking appointment conflict:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to check conflict' },
			{ status: 500 }
		);
	}
}

