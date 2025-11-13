import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { generateWhatsAppMessage, formatPhoneNumber, isValidPhoneNumber, type WhatsAppData } from '@/lib/whatsapp';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappFromNumber = process.env.TWILIO_WHATSAPP_NUMBER || `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

// Initialize Twilio client if credentials are available
const twilioClient = accountSid && authToken 
	? twilio(accountSid, authToken)
	: null;

export async function POST(request: NextRequest) {
	try {
		const whatsappData: WhatsAppData = await request.json();

		// Validate required fields
		if (!whatsappData.to || !whatsappData.template) {
			return NextResponse.json(
				{ error: 'Missing required fields: to, template' },
				{ status: 400 }
			);
		}

		// Format and validate phone number
		const formattedPhone = formatPhoneNumber(whatsappData.to);
		if (!formattedPhone || !isValidPhoneNumber(whatsappData.to)) {
			return NextResponse.json(
				{ error: 'Invalid phone number format. Please include country code (e.g., +1234567890)' },
				{ status: 400 }
			);
		}

		// Check if Twilio is configured
		if (!twilioClient || !whatsappFromNumber) {
			console.warn('Twilio not configured. WhatsApp message will not be sent.');
			// In development, return success but log the message
			if (process.env.NODE_ENV === 'development') {
				const message = generateWhatsAppMessage(whatsappData.template, whatsappData.data);
				console.log('WhatsApp message would be sent:', {
					to: formattedPhone,
					message,
					template: whatsappData.template,
				});
				return NextResponse.json({ 
					success: true, 
					message: 'WhatsApp message logged (development mode)',
					preview: message,
				});
			}
			return NextResponse.json(
				{ error: 'WhatsApp service not configured' },
				{ status: 500 }
			);
		}

		// Generate WhatsApp message
		const message = generateWhatsAppMessage(whatsappData.template, whatsappData.data);

		// Format phone number for WhatsApp (add whatsapp: prefix)
		const whatsappTo = `whatsapp:${formattedPhone}`;

		// Send WhatsApp message via Twilio
		try {
			const result = await twilioClient.messages.create({
				body: message,
				from: whatsappFromNumber.startsWith('whatsapp:') ? whatsappFromNumber : `whatsapp:${whatsappFromNumber}`,
				to: whatsappTo,
			});

			if (result.errorCode || result.errorMessage) {
				console.error('Twilio API error:', result.errorCode, result.errorMessage);
				return NextResponse.json(
					{ error: result.errorMessage || 'Failed to send WhatsApp message' },
					{ status: 500 }
				);
			}

			return NextResponse.json({ 
				success: true, 
				messageId: result.sid,
				status: result.status,
			});
		} catch (twilioError: unknown) {
			console.error('Twilio error:', twilioError);
			const error = twilioError as { message?: string; code?: number };
			return NextResponse.json(
				{ error: error.message || 'Failed to send WhatsApp message' },
				{ status: 500 }
			);
		}
	} catch (error) {
		console.error('WhatsApp API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}

