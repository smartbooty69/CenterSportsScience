/**
 * SMS Test Script
 * 
 * This script tests the SMS functionality by sending a test SMS message
 * using the Twilio API through the Next.js API route.
 * 
 * Usage:
 *   node test-sms.js <phone-number>
 * 
 * Example:
 *   node test-sms.js +1234567890
 *   node test-sms.js 1234567890
 */

const readline = require('readline');

// Get phone number from command line argument or prompt
const phoneNumber = process.argv[2];

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

async function testSMS(toPhoneNumber) {
	if (!toPhoneNumber) {
		console.error('❌ Error: Phone number is required');
		console.log('\nUsage: node test-sms.js <phone-number>');
		console.log('Example: node test-sms.js +1234567890');
		process.exit(1);
	}

	// Get the base URL (default to localhost:3000 for development)
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
	const apiUrl = `${baseUrl}/api/sms`;

	console.log('📱 SMS Test Script');
	console.log('==================\n');
	console.log(`API URL: ${apiUrl}`);
	console.log(`To: ${toPhoneNumber}\n`);

	// Test data for patient registration SMS
	const testData = {
		to: toPhoneNumber,
		template: 'patient-registered',
		data: {
			patientName: 'Test Patient',
			patientPhone: toPhoneNumber,
			patientId: 'TEST-12345'
		}
	};

	console.log('Sending test SMS...\n');
	console.log('Test Data:', JSON.stringify(testData, null, 2));
	console.log('\n---\n');

	try {
		// Use node-fetch if available, otherwise use built-in fetch (Node 18+)
		let fetchFn;
		try {
			// Try to use node-fetch if installed
			fetchFn = require('node-fetch');
		} catch {
			// Fall back to global fetch (Node 18+)
			fetchFn = globalThis.fetch || fetch;
		}

		const response = await fetchFn(apiUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(testData),
		});

		const result = await response.json();

		if (response.ok) {
			console.log('✅ SMS sent successfully!\n');
			console.log('Response:', JSON.stringify(result, null, 2));
			
			if (result.messageId) {
				console.log(`\n📋 Message ID: ${result.messageId}`);
				console.log(`📊 Status: ${result.status}`);
			}
			
			if (result.preview) {
				console.log(`\n📝 Message Preview:\n${result.preview}`);
			}
		} else {
			console.error('❌ Failed to send SMS\n');
			console.error('Error:', result.error || result);
			console.error(`Status: ${response.status}`);
		}
	} catch (error) {
		console.error('❌ Error occurred while sending SMS:\n');
		console.error(error.message);
		
		if (error.code === 'ECONNREFUSED') {
			console.error('\n💡 Make sure your Next.js development server is running:');
			console.error('   npm run dev');
		}
	}
}

// If phone number provided as argument, use it directly
if (phoneNumber) {
	testSMS(phoneNumber).then(() => {
		process.exit(0);
	}).catch((error) => {
		console.error('Unexpected error:', error);
		process.exit(1);
	});
} else {
	// Otherwise, prompt for phone number
	rl.question('Enter phone number to test (e.g., +1234567890): ', (answer) => {
		rl.close();
		if (answer.trim()) {
			testSMS(answer.trim()).then(() => {
				process.exit(0);
			}).catch((error) => {
				console.error('Unexpected error:', error);
				process.exit(1);
			});
		} else {
			console.error('❌ Phone number is required');
			process.exit(1);
		}
	});
}

