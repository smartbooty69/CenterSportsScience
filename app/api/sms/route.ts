import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { generateSMSMessage, formatPhoneNumber, isValidPhoneNumber, type SMSData } from '@/lib/sms';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client if credentials are available
const twilioClient = accountSid && authToken 
	? twilio(accountSid, authToken)
	: null;

export async function POST(request: NextRequest) {
	try {
		const smsData: SMSData = await request.json();

		// Validate required fields
		if (!smsData.to || !smsData.template) {
			return NextResponse.json(
				{ error: 'Missing required fields: to, template' },
				{ status: 400 }
			);
		}

		// Format and validate phone number
		const formattedPhone = formatPhoneNumber(smsData.to);
		if (!formattedPhone || !isValidPhoneNumber(smsData.to)) {
			return NextResponse.json(
				{ error: 'Invalid phone number format. Please include country code (e.g., +1234567890)' },
				{ status: 400 }
			);
		}

		// Check if Twilio is configured
		if (!twilioClient || !fromNumber) {
			console.warn('Twilio not configured. SMS will not be sent.');
			// In development, return success but log the SMS
			if (process.env.NODE_ENV === 'development') {
				const message = generateSMSMessage(smsData.template, smsData.data);
				console.log('SMS would be sent:', {
					to: formattedPhone,
					message,
					template: smsData.template,
				});
				return NextResponse.json({ 
					success: true, 
					message: 'SMS logged (development mode)',
					preview: message,
				});
			}
			return NextResponse.json(
				{ error: 'SMS service not configured' },
				{ status: 500 }
			);
		}

		// Generate SMS message
		const message = generateSMSMessage(smsData.template, smsData.data);

		// Send SMS via Twilio
		try {
			const result = await twilioClient.messages.create({
				body: message,
				from: fromNumber,
				to: formattedPhone,
			});

			if (result.errorCode || result.errorMessage) {
				console.error('Twilio API error:', result.errorCode, result.errorMessage);
				return NextResponse.json(
					{ error: result.errorMessage || 'Failed to send SMS' },
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
				{ error: error.message || 'Failed to send SMS' },
				{ status: 500 }
			);
		}
	} catch (error) {
		console.error('SMS API error:', error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
}

