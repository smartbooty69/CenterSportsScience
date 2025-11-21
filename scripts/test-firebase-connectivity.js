/**
 * Test script to check network connectivity to Firebase/Google services
 * Run with: node scripts/test-firebase-connectivity.js
 */

const https = require('https');
const dns = require('dns');
const { promisify } = require('util');

const lookup = promisify(dns.lookup);

const testUrls = [
	'www.googleapis.com',
	'www.google.com',
	'firebase.googleapis.com',
];

const testPort = 443;

async function testConnectivity(hostname) {
	console.log(`\n🔍 Testing connectivity to ${hostname}...`);
	
	try {
		// Test DNS resolution
		console.log('  📡 Testing DNS resolution...');
		const addresses = await lookup(hostname, { family: 4 }); // Force IPv4
		console.log(`  ✅ DNS resolved to: ${addresses.address}`);
		
		// Test HTTPS connection
		console.log('  🔒 Testing HTTPS connection...');
		return new Promise((resolve, reject) => {
			const req = https.request({
				hostname,
				port: testPort,
				method: 'HEAD',
				timeout: 5000,
			}, (res) => {
				console.log(`  ✅ HTTPS connection successful (Status: ${res.statusCode})`);
				resolve(true);
			});
			
			req.on('error', (error) => {
				console.log(`  ❌ HTTPS connection failed: ${error.message}`);
				reject(error);
			});
			
			req.on('timeout', () => {
				req.destroy();
				console.log(`  ❌ HTTPS connection timed out after 5 seconds`);
				reject(new Error('Connection timeout'));
			});
			
			req.end();
		});
	} catch (error) {
		console.log(`  ❌ Failed: ${error.message}`);
		throw error;
	}
}

async function checkIPv6() {
	console.log('\n🔍 Checking IPv6 configuration...');
	try {
		const addresses = await lookup('www.google.com', { family: 6 });
		console.log(`  ⚠️  IPv6 is enabled and resolving (${addresses.address})`);
		console.log(`  💡 If you're experiencing network issues, try disabling IPv6 or adding NODE_OPTIONS=--dns-result-order=ipv4first to .env.local`);
	} catch (error) {
		console.log(`  ✅ IPv6 appears to be disabled or not available (this is fine)`);
	}
}

async function checkProxy() {
	console.log('\n🔍 Checking proxy configuration...');
	const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];
	let foundProxy = false;
	
	for (const varName of proxyVars) {
		if (process.env[varName]) {
			console.log(`  ✅ Found ${varName}: ${process.env[varName]}`);
			foundProxy = true;
		}
	}
	
	if (!foundProxy) {
		console.log(`  ℹ️  No proxy environment variables found`);
		console.log(`  💡 If you're behind a corporate proxy, set HTTP_PROXY and HTTPS_PROXY in .env.local`);
	}
}

async function main() {
	console.log('🚀 Firebase Network Connectivity Test');
	console.log('=====================================\n');
	
	// Check IPv6
	await checkIPv6().catch(() => {});
	
	// Check proxy
	checkProxy();
	
	// Test connectivity
	let allPassed = true;
	for (const url of testUrls) {
		try {
			await testConnectivity(url);
		} catch (error) {
			allPassed = false;
		}
	}
	
	console.log('\n=====================================');
	if (allPassed) {
		console.log('✅ All connectivity tests passed!');
		console.log('   Your network should be able to connect to Firebase services.');
	} else {
		console.log('❌ Some connectivity tests failed!');
		console.log('\n💡 Troubleshooting steps:');
		console.log('   1. Check your internet connection');
		console.log('   2. Verify firewall/antivirus isn\'t blocking Node.js');
		console.log('   3. Try disabling IPv6 (see FIREBASE_ADMIN_SETUP.md)');
		console.log('   4. Configure proxy if on corporate network');
		console.log('   5. See FIREBASE_ADMIN_SETUP.md for detailed troubleshooting');
		process.exit(1);
	}
}

main().catch((error) => {
	console.error('\n❌ Test script failed:', error);
	process.exit(1);
});

