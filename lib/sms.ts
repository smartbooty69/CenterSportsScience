export type SMSTemplate = 
	| 'appointment-created'
	| 'appointment-reminder'
	| 'appointment-cancelled'
	| 'appointment-updated'
	| 'patient-registered'
	| 'billing-pending';

export interface SMSData {
	to: string;
	template: SMSTemplate;
	data: Record<string, unknown>;
}

export interface AppointmentSMSData {
	patientName: string;
	patientPhone: string;
	patientId?: string;
	doctor: string;
	date: string;
	time: string;
	appointmentId?: string;
}

export interface PatientRegistrationSMSData {
	patientName: string;
	patientPhone: string;
	patientId: string;
}

/**
 * Generate SMS message based on template
 */
export function generateSMSMessage(template: SMSTemplate, data: Record<string, unknown>): string {
	const clinicName = 'Centre For Sports Science';
	const clinicPhone = process.env.NEXT_PUBLIC_CLINIC_PHONE || '';

	switch (template) {
		case 'appointment-created': {
			const appointmentData = data as AppointmentSMSData;
			let message = `Hi ${appointmentData.patientName}, your appointment is confirmed with ${clinicName}.\n\n`;
			message += `Date: ${appointmentData.date}\n`;
			message += `Time: ${appointmentData.time}\n`;
			message += `Clinician: ${appointmentData.doctor}\n`;
			if (appointmentData.appointmentId) {
				message += `Appt ID: ${appointmentData.appointmentId}\n`;
			}
			message += `\nPlease arrive 10 mins early.`;
			if (clinicPhone) {
				message += ` Questions? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'appointment-reminder': {
			const appointmentData = data as AppointmentSMSData;
			let message = `Reminder: You have an appointment tomorrow with ${clinicName}.\n\n`;
			message += `Date: ${appointmentData.date}\n`;
			message += `Time: ${appointmentData.time}\n`;
			message += `Clinician: ${appointmentData.doctor}\n`;
			message += `\nPlease arrive 10 mins early.`;
			if (clinicPhone) {
				message += ` Need to reschedule? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'appointment-cancelled': {
			const appointmentData = data as AppointmentSMSData;
			let message = `Hi ${appointmentData.patientName}, your appointment on ${appointmentData.date} at ${appointmentData.time} has been cancelled.\n\n`;
			if (clinicPhone) {
				message += `To reschedule, call ${clinicPhone}`;
			} else {
				message += `Please contact us to reschedule.`;
			}
			return message;
		}

		case 'appointment-updated': {
			const appointmentData = data as AppointmentSMSData;
			let message = `Hi ${appointmentData.patientName}, your appointment has been updated.\n\n`;
			message += `New Date: ${appointmentData.date}\n`;
			message += `New Time: ${appointmentData.time}\n`;
			message += `Clinician: ${appointmentData.doctor}\n`;
			if (clinicPhone) {
				message += `\nQuestions? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'patient-registered': {
			const registrationData = data as PatientRegistrationSMSData;
			let message = `Welcome to ${clinicName}, ${registrationData.patientName}!\n\n`;
			message += `Your Patient ID: ${registrationData.patientId}\n`;
			message += `Please save this ID for future reference.`;
			if (clinicPhone) {
				message += `\n\nQuestions? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'billing-pending': {
			const billingData = data as {
				patientName: string;
				patientPhone: string;
				patientId?: string;
				billingId?: string;
				amount: string | number;
				date: string;
			};
			const amount = typeof billingData.amount === 'number' 
				? `₹${billingData.amount.toFixed(2)}` 
				: billingData.amount;
			let message = `Hi ${billingData.patientName}, payment reminder from ${clinicName}.\n\n`;
			message += `Amount Due: ${amount}\n`;
			message += `Service Date: ${billingData.date}\n`;
			if (billingData.billingId) {
				message += `Bill ID: ${billingData.billingId}\n`;
			}
			message += `\nPlease settle at your earliest convenience.`;
			if (clinicPhone) {
				message += ` Questions? Call ${clinicPhone}`;
			}
			return message;
		}

		default:
			return `Notification from ${clinicName}`;
	}
}

/**
 * Format phone number for SMS (E.164 format)
 */
export function formatPhoneNumber(phone: string): string | null {
	// Remove all non-digit characters
	const digits = phone.replace(/\D/g, '');
	
	// If it starts with 0, remove it (common in some countries)
	const cleaned = digits.startsWith('0') ? digits.slice(1) : digits;
	
	// Check if it's a valid length (7-15 digits)
	if (cleaned.length < 7 || cleaned.length > 15) {
		return null;
	}
	
	// If it doesn't start with +, assume it's a US number and add +1
	// For international numbers, they should already include country code
	if (!phone.startsWith('+')) {
		// If it's 10 digits, assume US number
		if (cleaned.length === 10) {
			return `+1${cleaned}`;
		}
		// If it's 11 digits and starts with 1, assume US number
		if (cleaned.length === 11 && cleaned.startsWith('1')) {
			return `+${cleaned}`;
		}
		// Otherwise, return as is (user should provide country code)
		return `+${cleaned}`;
	}
	
	return phone;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
	const formatted = formatPhoneNumber(phone);
	if (!formatted) return false;
	
	// E.164 format: + followed by 1-15 digits
	const e164Regex = /^\+[1-9]\d{1,14}$/;
	return e164Regex.test(formatted);
}

/**
 * Send SMS notification via API route
 */
export async function sendSMSNotification(smsData: SMSData): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch('/api/sms', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(smsData),
		});

		if (!response.ok) {
			const error = await response.text();
			return { success: false, error };
		}

		return { success: true };
	} catch (error) {
		console.error('Failed to send SMS notification:', error);
		return { 
			success: false, 
			error: error instanceof Error ? error.message : 'Unknown error' 
		};
	}
}

