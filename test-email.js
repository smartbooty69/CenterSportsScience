/**
 * Email Test Script
 * 
 * This script tests the email functionality by sending a test email
 * using the Resend API through the Next.js API route.
 * 
 * Usage:
 *   node test-email.js <email-address>
 * 
 * Example:
 *   node test-email.js clancymendonca@gmail.com
 */

const readline = require('readline');

// Get email from command line argument or prompt
const emailAddress = process.argv[2];

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});

async function testEmail(toEmail) {
	if (!toEmail) {
		console.error('❌ Error: Email address is required');
		console.log('\nUsage: node test-email.js <email-address>');
		console.log('Example: node test-email.js clancymendonca@gmail.com');
		process.exit(1);
	}

	// Get the base URL (default to localhost:3000 for development)
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
	const apiUrl = `${baseUrl}/api/email`;

	console.log('📧 Email Test Script');
	console.log('==================\n');
	console.log(`API URL: ${apiUrl}`);
	console.log(`To: ${toEmail}\n`);

	// Test data for patient registration email
	const testData = {
		to: toEmail,
		template: 'patient-registered',
		data: {
			patientName: 'Test Patient',
			patientEmail: toEmail,
			patientId: 'TEST-12345'
		}
	};

	console.log('Sending test email...\n');
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
			console.log('✅ Email sent successfully!\n');
			console.log('Response:', JSON.stringify(result, null, 2));
			
			if (result.messageId) {
				console.log(`\n📋 Message ID: ${result.messageId}`);
			}
			
			if (result.message) {
				console.log(`\n📝 ${result.message}`);
			}
		} else {
			console.error('❌ Failed to send email\n');
			console.error('Error:', result.error || result);
			console.error(`Status: ${response.status}`);
		}
	} catch (error) {
		console.error('❌ Error occurred while sending email:\n');
		console.error(error.message);
		
		if (error.code === 'ECONNREFUSED') {
			console.error('\n💡 Make sure your Next.js development server is running:');
			console.error('   npm run dev');
		}
	}
}

// If email provided as argument, use it directly
if (emailAddress) {
	testEmail(emailAddress).then(() => {
		process.exit(0);
	}).catch((error) => {
		console.error('Unexpected error:', error);
		process.exit(1);
	});
} else {
	// Otherwise, prompt for email
	rl.question('Enter email address to test (e.g., clancymendonca@gmail.com): ', (answer) => {
		rl.close();
		if (answer.trim()) {
			testEmail(answer.trim()).then(() => {
				process.exit(0);
			}).catch((error) => {
				console.error('Unexpected error:', error);
				process.exit(1);
			});
		} else {
			console.error('❌ Email address is required');
			process.exit(1);
		}
	});
}


