export type WhatsAppTemplate = 
	| 'appointment-created'
	| 'appointment-reminder'
	| 'appointment-cancelled'
	| 'appointment-updated'
	| 'patient-registered';

export interface WhatsAppData {
	to: string;
	template: WhatsAppTemplate;
	data: Record<string, unknown>;
}

export interface AppointmentWhatsAppData {
	patientName: string;
	patientPhone: string;
	patientId?: string;
	doctor: string;
	date: string;
	time: string;
	appointmentId?: string;
}

export interface PatientRegistrationWhatsAppData {
	patientName: string;
	patientPhone: string;
	patientId: string;
}

/**
 * Generate WhatsApp message based on template
 */
export function generateWhatsAppMessage(template: WhatsAppTemplate, data: Record<string, unknown>): string {
	const clinicName = 'Centre For Sports Science';
	const clinicPhone = process.env.NEXT_PUBLIC_CLINIC_PHONE || '';

	switch (template) {
		case 'appointment-created': {
			const appointmentData = data as AppointmentWhatsAppData;
			let message = `✅ *Appointment Confirmed*\n\n`;
			message += `Hi ${appointmentData.patientName}, your appointment is confirmed with ${clinicName}.\n\n`;
			message += `📅 *Date:* ${appointmentData.date}\n`;
			message += `🕐 *Time:* ${appointmentData.time}\n`;
			message += `👨‍⚕️ *Clinician:* ${appointmentData.doctor}\n`;
			if (appointmentData.appointmentId) {
				message += `🆔 *Appt ID:* ${appointmentData.appointmentId}\n`;
			}
			message += `\nPlease arrive 10 minutes early.`;
			if (clinicPhone) {
				message += `\n\nQuestions? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'appointment-reminder': {
			const appointmentData = data as AppointmentWhatsAppData;
			let message = `🔔 *Appointment Reminder*\n\n`;
			message += `Hi ${appointmentData.patientName}, you have an appointment *tomorrow* with ${clinicName}.\n\n`;
			message += `📅 *Date:* ${appointmentData.date}\n`;
			message += `🕐 *Time:* ${appointmentData.time}\n`;
			message += `👨‍⚕️ *Clinician:* ${appointmentData.doctor}\n`;
			message += `\nPlease arrive 10 minutes early.`;
			if (clinicPhone) {
				message += `\n\nNeed to reschedule? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'appointment-cancelled': {
			const appointmentData = data as AppointmentWhatsAppData;
			let message = `❌ *Appointment Cancelled*\n\n`;
			message += `Hi ${appointmentData.patientName}, your appointment on ${appointmentData.date} at ${appointmentData.time} has been cancelled.\n\n`;
			if (clinicPhone) {
				message += `To reschedule, call ${clinicPhone}`;
			} else {
				message += `Please contact us to reschedule.`;
			}
			return message;
		}

		case 'appointment-updated': {
			const appointmentData = data as AppointmentWhatsAppData;
			let message = `📝 *Appointment Updated*\n\n`;
			message += `Hi ${appointmentData.patientName}, your appointment has been updated.\n\n`;
			message += `📅 *New Date:* ${appointmentData.date}\n`;
			message += `🕐 *New Time:* ${appointmentData.time}\n`;
			message += `👨‍⚕️ *Clinician:* ${appointmentData.doctor}\n`;
			if (clinicPhone) {
				message += `\nQuestions? Call ${clinicPhone}`;
			}
			return message;
		}

		case 'patient-registered': {
			const registrationData = data as PatientRegistrationWhatsAppData;
			let message = `👋 *Welcome to ${clinicName}*\n\n`;
			message += `Hi ${registrationData.patientName}, thank you for registering with us!\n\n`;
			message += `🆔 *Your Patient ID:* ${registrationData.patientId}\n`;
			message += `\nPlease save this ID for future reference.`;
			if (clinicPhone) {
				message += `\n\nQuestions? Call ${clinicPhone}`;
			}
			return message;
		}

		default:
			return `Notification from ${clinicName}`;
	}
}

/**
 * Format phone number for WhatsApp (E.164 format, same as SMS)
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
 * Send WhatsApp notification via API route
 */
export async function sendWhatsAppNotification(whatsappData: WhatsAppData): Promise<{ success: boolean; error?: string }> {
	try {
		const response = await fetch('/api/whatsapp', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(whatsappData),
		});

		if (!response.ok) {
			const error = await response.text();
			return { success: false, error };
		}

		return { success: true };
	} catch (error) {
		console.error('Failed to send WhatsApp notification:', error);
		return { 
			success: false, 
			error: error instanceof Error ? error.message : 'Unknown error' 
		};
	}
}

