export interface User {
	userName: string;
	userEmail: string;
	userPassword: string;
	userRole: 'Admin' | 'FrontDesk' | 'ClinicalTeam';
	userStatus: 'Active' | 'Inactive';
	createdAt?: string;
}

export interface Patient {
	patientId: string;
	name: string;
	dob: string;
	gender: string;
	phone: string;
	email: string;
	address: string;
	status: 'pending' | 'ongoing' | 'completed';
	registeredAt: string;
}

export interface Appointment {
	patientId: string;
	patient: string;
	doctor: string;
	date: string;
	time: string;
	status: 'pending' | 'ongoing' | 'completed' | 'cancelled';
	notes?: string;
	createdAt: string;
}

export interface BillingRecord {
	billingId: string;
	appointmentId: string;
	patient: string;
	amount: number;
	status: 'pending' | 'completed';
	date: string;
}

