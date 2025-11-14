import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs, query, setDoc, where, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AppointmentTemplate {
	id?: string;
	name: string;
	doctor: string;
	time: string;
	duration: number;
	notes?: string;
	createdBy: string;
	createdAt: string;
}

export async function GET(req: Request) {
	try {
		const { searchParams } = new URL(req.url);
		const doctor = searchParams.get('doctor');

		let templatesQuery;
		if (doctor) {
			templatesQuery = query(collection(db, 'appointmentTemplates'), where('doctor', '==', doctor));
		} else {
			templatesQuery = collection(db, 'appointmentTemplates');
		}

		const snapshot = await getDocs(templatesQuery);
		const templates = snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data(),
		}));

		return NextResponse.json({ success: true, data: templates });
	} catch (error) {
		console.error('Error fetching appointment templates:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to fetch templates' },
			{ status: 500 }
		);
	}
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { name, doctor, time, duration, notes } = body;

		if (!name || !doctor || !time) {
			return NextResponse.json(
				{ success: false, message: 'Missing required fields: name, doctor, time' },
				{ status: 400 }
			);
		}

		const template: Omit<AppointmentTemplate, 'id'> = {
			name,
			doctor,
			time,
			duration: duration || 30,
			notes: notes || '',
			createdBy: 'system',
			createdAt: new Date().toISOString(),
		};

		const docRef = doc(collection(db, 'appointmentTemplates'));
		await setDoc(docRef, template);

		return NextResponse.json({
			success: true,
			data: { id: docRef.id, ...template },
		});
	} catch (error) {
		console.error('Error creating appointment template:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to create template' },
			{ status: 500 }
		);
	}
}

export async function DELETE(req: Request) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get('id');

		if (!id) {
			return NextResponse.json({ success: false, message: 'Missing template id' }, { status: 400 });
		}

		await deleteDoc(doc(db, 'appointmentTemplates', id));

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting appointment template:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to delete template' },
			{ status: 500 }
		);
	}
}

