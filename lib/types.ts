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

export type NotificationCategory =
	| 'appointment'
	| 'reminder'
	| 'system'
	| 'patient'
	| 'billing'
	| 'other';

export type NotificationStatus = 'unread' | 'read';

export interface NotificationChannelSettings {
	email: boolean;
	sms: boolean;
	whatsapp: boolean;
	inApp: boolean;
}

export interface NotificationRecord {
	id: string;
	userId: string;
	title: string;
	message: string;
	category: NotificationCategory;
	status: NotificationStatus;
	createdAt: string;
	readAt?: string | null;
	metadata?: Record<string, unknown>;
	channels?: Partial<NotificationChannelSettings>;
	acknowledgedBy?: string[];
	source?: string;
}

export interface NotificationPreference {
	userId: string;
	channels: NotificationChannelSettings;
	reminderLeadTimeHours: number;
	digestEnabled: boolean;
	updatedAt: string;
}

