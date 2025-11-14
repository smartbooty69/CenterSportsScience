import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs, query, setDoc, where, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AvailabilityTemplate {
	id?: string;
	name: string;
	schedule: {
		[day: string]: {
			enabled: boolean;
			slots: Array<{ start: string; end: string }>;
		};
	};
	createdBy: string;
	createdAt: string;
}

export async function GET(req: Request) {
	try {
		const snapshot = await getDocs(collection(db, 'availabilityTemplates'));
		const templates = snapshot.docs.map(doc => ({
			id: doc.id,
			...doc.data(),
		}));

		return NextResponse.json({ success: true, data: templates });
	} catch (error) {
		console.error('Error fetching availability templates:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to fetch templates' },
			{ status: 500 }
		);
	}
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const { name, schedule } = body;

		if (!name || !schedule) {
			return NextResponse.json(
				{ success: false, message: 'Missing required fields: name, schedule' },
				{ status: 400 }
			);
		}

		const template: Omit<AvailabilityTemplate, 'id'> = {
			name,
			schedule,
			createdBy: 'system',
			createdAt: new Date().toISOString(),
		};

		const docRef = doc(collection(db, 'availabilityTemplates'));
		await setDoc(docRef, template);

		return NextResponse.json({
			success: true,
			data: { id: docRef.id, ...template },
		});
	} catch (error) {
		console.error('Error creating availability template:', error);
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

		await deleteDoc(doc(db, 'availabilityTemplates', id));

		return NextResponse.json({ success: true });
	} catch (error) {
		console.error('Error deleting availability template:', error);
		return NextResponse.json(
			{ success: false, message: 'Failed to delete template' },
			{ status: 500 }
		);
	}
}

