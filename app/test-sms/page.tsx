'use client';

import { useState } from 'react';

export default function TestSMSPage() {
	const [phoneNumber, setPhoneNumber] = useState('');
	const [template, setTemplate] = useState<SMSTemplate>('patient-registered');
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);

	type SMSTemplate = 
		| 'appointment-created'
		| 'appointment-reminder'
		| 'appointment-cancelled'
		| 'appointment-updated'
		| 'patient-registered';

	const handleTest = async () => {
		if (!phoneNumber.trim()) {
			setError('Please enter a phone number');
			return;
		}

		setLoading(true);
		setError(null);
		setResult(null);

		// Prepare test data based on template
		let testData: any = {
			to: phoneNumber.trim(),
			template,
			data: {},
		};

		// Set appropriate test data for each template
		switch (template) {
			case 'patient-registered':
				testData.data = {
					patientName: 'Test Patient',
					patientPhone: phoneNumber.trim(),
					patientId: 'TEST-12345',
				};
				break;
			case 'appointment-created':
			case 'appointment-reminder':
			case 'appointment-updated':
				testData.data = {
					patientName: 'Test Patient',
					patientPhone: phoneNumber.trim(),
					patientId: 'TEST-12345',
					doctor: 'Dr. Test Doctor',
					date: new Date().toLocaleDateString(),
					time: '10:00 AM',
					appointmentId: 'APT-TEST-001',
				};
				break;
			case 'appointment-cancelled':
				testData.data = {
					patientName: 'Test Patient',
					patientPhone: phoneNumber.trim(),
					date: new Date().toLocaleDateString(),
					time: '10:00 AM',
				};
				break;
		}

		try {
			const response = await fetch('/api/sms', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(testData),
			});

			const data = await response.json();

			if (response.ok) {
				setResult(data);
			} else {
				setError(data.error || 'Failed to send SMS');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unknown error occurred');
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="container mx-auto p-6 max-w-2xl">
			<h1 className="text-3xl font-bold mb-6">SMS Test Page</h1>

			<div className="bg-white rounded-lg shadow-md p-6 space-y-4">
				<div>
					<label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
						Phone Number
					</label>
					<input
						id="phone"
						type="tel"
						value={phoneNumber}
						onChange={(e) => setPhoneNumber(e.target.value)}
						placeholder="+1234567890"
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<p className="mt-1 text-sm text-gray-500">
						Include country code (e.g., +1 for US, +44 for UK)
					</p>
				</div>

				<div>
					<label htmlFor="template" className="block text-sm font-medium text-gray-700 mb-2">
						SMS Template
					</label>
					<select
						id="template"
						value={template}
						onChange={(e) => setTemplate(e.target.value as SMSTemplate)}
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="patient-registered">Patient Registered</option>
						<option value="appointment-created">Appointment Created</option>
						<option value="appointment-reminder">Appointment Reminder</option>
						<option value="appointment-updated">Appointment Updated</option>
						<option value="appointment-cancelled">Appointment Cancelled</option>
					</select>
				</div>

				<button
					onClick={handleTest}
					disabled={loading || !phoneNumber.trim()}
					className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
				>
					{loading ? 'Sending...' : 'Send Test SMS'}
				</button>

				{error && (
					<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
						<strong>Error:</strong> {error}
					</div>
				)}

				{result && (
					<div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
						<div className="font-semibold mb-2">✅ Success!</div>
						{result.messageId && (
							<div className="text-sm mb-1">
								<strong>Message ID:</strong> {result.messageId}
							</div>
						)}
						{result.status && (
							<div className="text-sm mb-1">
								<strong>Status:</strong> {result.status}
							</div>
						)}
						{result.preview && (
							<div className="mt-3">
								<strong>Message Preview:</strong>
								<pre className="mt-2 bg-white p-2 rounded text-xs whitespace-pre-wrap">
									{result.preview}
								</pre>
							</div>
						)}
						{result.message && (
							<div className="text-sm mt-2">
								{result.message}
							</div>
						)}
					</div>
				)}
			</div>

			<div className="mt-6 bg-gray-50 rounded-lg p-4">
				<h2 className="font-semibold mb-2">Environment Check</h2>
				<div className="text-sm space-y-1">
					<div>
						TWILIO_ACCOUNT_SID: {process.env.NEXT_PUBLIC_TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Not set'}
					</div>
					<div>
						TWILIO_AUTH_TOKEN: {process.env.NEXT_PUBLIC_TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Not set'}
					</div>
					<div>
						TWILIO_PHONE_NUMBER: {process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER ? '✅ Set' : '❌ Not set'}
					</div>
					<p className="mt-2 text-gray-600">
						Note: These environment variables are server-side only and won't show here for security reasons.
						Check your .env.local file to verify they are set.
					</p>
				</div>
			</div>
		</div>
	);
}


