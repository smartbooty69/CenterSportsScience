import { NextResponse } from 'next/server';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function POST(req: Request) {
	try {
		// Get today's date
		const today = new Date();
		const appointments = [];

		// Generate sample appointments for the next 14 days
		for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
			const appointmentDate = new Date(today);
			appointmentDate.setDate(today.getDate() + dayOffset);
			const dateStr = appointmentDate.toISOString().split('T')[0]; // YYYY-MM-DD format

			// Create 2-4 appointments per day at different times
			const timesPerDay = Math.floor(Math.random() * 3) + 2; // 2-4 appointments
			const timeSlots = ['09:00', '10:30', '14:00', '15:30', '16:00', '17:00'];
			const doctors = ['Dr. Smith', 'Dr. Johnson', 'Dr. Williams', 'Dr. Brown', 'Dr. Davis'];
			const patients = [
				'John Doe',
				'Jane Smith',
				'Robert Johnson',
				'Emily Williams',
				'Michael Brown',
				'Sarah Davis',
				'David Wilson',
				'Lisa Anderson',
			];
			const statuses = ['pending', 'ongoing', 'completed', 'pending', 'pending']; // More pending for variety

			for (let i = 0; i < timesPerDay; i++) {
				const timeIndex = Math.floor(Math.random() * timeSlots.length);
				const doctorIndex = Math.floor(Math.random() * doctors.length);
				const patientIndex = Math.floor(Math.random() * patients.length);
				const statusIndex = Math.floor(Math.random() * statuses.length);

				// Generate appointment ID
				const appointmentId = `APT${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

				appointments.push({
					appointmentId,
					patientId: `PAT${1000 + Math.floor(Math.random() * 9000)}`,
					patient: patients[patientIndex],
					doctor: doctors[doctorIndex],
					date: dateStr,
					time: timeSlots[timeIndex],
					status: statuses[statusIndex],
					notes: `Sample appointment for testing calendar display`,
					createdAt: serverTimestamp(),
				});
			}
		}

		// Batch create appointments
		const createdAppointments = [];
		for (const appointment of appointments) {
			try {
				const docRef = await addDoc(collection(db, 'appointments'), appointment);
				createdAppointments.push({ id: docRef.id, ...appointment });
			} catch (error) {
				console.error('Error creating appointment:', error);
			}
		}

		return NextResponse.json({
			success: true,
			message: `Successfully created ${createdAppointments.length} sample appointments`,
			data: {
				count: createdAppointments.length,
				appointments: createdAppointments,
			},
		});
	} catch (error) {
		console.error('Error seeding appointments:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to seed appointments', error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

