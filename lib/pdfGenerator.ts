export interface PatientReportData {
	patientName: string;
	patientId: string;
	referredBy?: string;
	age?: string;
	gender?: string;
	dateOfConsultation?: string;
	contact?: string;
	email?: string;
	// Session tracking
	totalSessionsRequired?: number;
	remainingSessions?: number;
	complaints?: string;
	presentHistory?: string;
	pastHistory?: string;
	medicalHistory?: string;
	surgicalHistory?: string;
	sleepCycle?: string;
	hydration?: string;
	nutrition?: string;
	chiefComplaint?: string;
	onsetType?: string;
	duration?: string;
	mechanismOfInjury?: string;
	painType?: string;
	painIntensity?: string;
	aggravatingFactor?: string;
	relievingFactor?: string;
	siteSide?: string;
	onset?: string;
	natureOfInjury?: string;
	typeOfPain?: string;
	vasScale?: string;
	rom?: Record<string, any>;
	mmt?: Record<string, any>;
	built?: string;
	posture?: string;
	postureManualNotes?: string;
	postureFileName?: string;
	gaitAnalysis?: string;
	gaitManualNotes?: string;
	gaitFileName?: string;
	mobilityAids?: string;
	localObservation?: string;
	swelling?: string;
	muscleWasting?: string;
	tenderness?: string;
	warmth?: string;
	scar?: string;
	crepitus?: string;
	odema?: string;
	specialTest?: string;
	differentialDiagnosis?: string;
	finalDiagnosis?: string;
	shortTermGoals?: string;
	longTermGoals?: string;
	rehabProtocol?: string;
	advice?: string;
	managementRemarks?: string;
	nextFollowUpDate?: string;
	nextFollowUpTime?: string;
	followUpVisits?: Array<{ visitDate: string; painLevel: string; findings: string }>;
	currentPainStatus?: string;
	currentRom?: string;
	currentStrength?: string;
	currentFunctionalAbility?: string;
	complianceWithHEP?: string;
	physioName?: string;
	physioRegNo?: string;
	patientType?: string;
}

const HYDRATION_DESCRIPTORS = [
	'Optimal hydration',
	'Well hydrated',
	'Mildly hydrated',
	'Stable',
	'Slightly dry',
	'Dehydrated',
	'Very dry',
	'Severely dry',
];

const VAS_EMOJIS = ['😀', '😁', '🙂', '😊', '😌', '😟', '😣', '😢', '😭', '😱'];

const getVasDescriptor = (value?: string) => {
	const score = Number(value || '5');
	return `${score}/10`;
};

const getHydrationDescriptor = (value?: string) => {
	const score = Number(value || '4');
	const emoji = HYDRATION_DESCRIPTORS[Math.min(HYDRATION_DESCRIPTORS.length - 1, Math.max(1, score) - 1)];
	return `${score}/8 - ${emoji}`;
};

const formatJointData = (records: Record<string, any> = {}) => {
	return Object.entries(records)
		.map(([joint, entry]) => {
			if (!entry) return null;
			if (entry.left || entry.right) {
				const left = entry.left
					? Object.entries(entry.left)
							.filter(([, val]) => val)
							.map(([motion, val]) => `Left ${motion}: ${val}`)
							.join(', ')
					: '';
				const right = entry.right
					? Object.entries(entry.right)
							.filter(([, val]) => val)
							.map(([motion, val]) => `Right ${motion}: ${val}`)
							.join(', ')
					: '';
				const summary = [left, right].filter(Boolean).join(' | ');
				return summary ? [joint, summary] : null;
			}

			const summary = Object.entries(entry)
				.filter(([, val]) => val)
				.map(([motion, val]) => `${motion}: ${val}`)
				.join(', ');
			return summary ? [joint, summary] : null;
		})
		.filter(Boolean) as string[][];
};

const buildCurrentStatus = (data: PatientReportData) => {
	return (
		`Pain: ${data.currentPainStatus || ''}\n` +
		`ROM: ${data.currentRom || ''}\n` +
		`Strength: ${data.currentStrength || ''}\n` +
		`Functional Ability: ${data.currentFunctionalAbility || ''}\n` +
		`HEP Compliance: ${data.complianceWithHEP || ''}`
	);
};

const baseStyles = {
	fontSize: 9,
	cellPadding: 2,
	lineWidth: 0.1,
};

const headStyles = {
	fillColor: [7, 89, 133] as [number, number, number],
	fontSize: 10,
	halign: 'left' as const,
	cellPadding: 2,
	textColor: [255, 255, 255] as [number, number, number],
};

export async function generatePhysiotherapyReportPDF(
	data: PatientReportData,
	options?: { forPrint?: boolean }
): Promise<string | void> {
	const [{ default: jsPDF }, autoTableModule] = await Promise.all([
		import('jspdf'),
		import('jspdf-autotable'),
	]);

	// jspdf-autotable v5 exports the function as default
	const autoTable = (autoTableModule as any).default || autoTableModule;

	const doc = new jsPDF('p', 'mm', 'a4');
	let y = 10; // Initial Y position for logos

	// Load and add Center Sports Science logo at left top corner
	try {
		const centerLogoResponse = await fetch('/CenterSportsScience_logo.jpg');
		if (centerLogoResponse.ok) {
			const centerLogoBlob = await centerLogoResponse.blob();
			const centerLogoDataUrl = await new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.readAsDataURL(centerLogoBlob);
			});
			// Left top corner logo - increased size to match header, positioned at (10mm, 10mm) with 35mm width, 18mm height
			doc.addImage(centerLogoDataUrl, 'JPEG', 10, y, 35, 18);
		} else {
			console.warn('Center Sports Science logo not found at /CenterSportsScience_logo.jpg');
		}
	} catch (error) {
		console.warn('Could not load Center Sports Science logo:', error);
	}

	// Load right top corner logo - DYES logo for DYES patients, otherwise sixs logo
	// Make comparison case-insensitive to handle variations
	const patientTypeUpper = data.patientType?.toUpperCase() || '';
	const isDYES = patientTypeUpper === 'DYES';
	const rightLogoPath = isDYES ? '/Dyes_logo.jpg' : '/sixs_logo.jpg';
	const rightLogoName = isDYES ? 'DYES' : 'Sixs';
	
	// Debug logging
	console.log('PDF Generation - patientType:', data.patientType, 'isDYES:', isDYES);
	
	try {
		const rightLogoResponse = await fetch(rightLogoPath);
		if (rightLogoResponse.ok) {
			const rightLogoBlob = await rightLogoResponse.blob();
			const rightLogoDataUrl = await new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.readAsDataURL(rightLogoBlob);
			});
			// Right top corner logo - increased size to match header, 35mm width, 18mm height
			doc.addImage(rightLogoDataUrl, 'JPEG', 165, y, 35, 18);
		} else {
			console.warn(`${rightLogoName} logo not found at ${rightLogoPath}`);
		}
	} catch (error) {
		console.warn(`Could not load ${rightLogoName} logo:`, error);
	}

	// Title - Bigger font size
	y = 30; // Adjusted Y position after logos
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(20); // Increased from 16 to 20
	doc.setTextColor(0, 51, 102);
	doc.text('CENTRE FOR SPORTS SCIENCE', 105, y, { align: 'center' });

	// Add contact information for PAID, VIP, GETHNA patients, or DYES association text for DYES patients
	if (isDYES) {
		// DYES association text
		y += 7;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(9);
		doc.setTextColor(0, 0, 0);
		doc.text('(In association with Department of Youth Empowerment and Sports-Govt of Karnataka)', 105, y, { align: 'center' });
		y += 4;
		doc.setFontSize(8);
		doc.text('GOVT ORDER: YU SE KRIE/VI/68/2016-17', 105, y, { align: 'center' });
		y += 6; // One line space
	} else {
		// For all non-DYES patients (PAID, VIP, GETHNA, or any other type), show phone and address in one line, smaller font
		y += 7;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(7); // Smaller font size
		doc.setTextColor(0, 0, 0);
		// Phone and address in one line - use splitTextToSize to handle wrapping if needed
		const contactText = 'Phone No: +91 9731128396 | Address: Sree Kanteerava Stadium Gate 8 and 10, Sampangiram Nagar, Bengaluru, Karnataka 560027, India';
		const contactLines = doc.splitTextToSize(contactText, 180);
		doc.text(contactLines, 105, y, { align: 'center' });
		y += contactLines.length * 3.5; // Adjust spacing based on number of lines
		y += 2.5; // Additional spacing to make it one line space total
	}
	
	// Next header in green color
	doc.setFontSize(12);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(0, 128, 0); // Green color
	doc.text('PHYSIOTHERAPY CONSULTATION & FOLLOW-UP REPORT', 105, y, { align: 'center' });

	y += 6;
	doc.setDrawColor(0, 51, 102);
	doc.line(12, y, 198, y);
	y += 4;

	// Build patient information body
	const patientInfoBody: string[][] = [
		['Patient Name', data.patientName],
	];
	
	// Add Organization Type right after Patient Name if available
	if (data.patientType) {
		patientInfoBody.push(['Organization Type', data.patientType]);
	}
	
	// Add remaining patient information
	patientInfoBody.push(
		['Patient ID', data.patientId],
		['Referred By / Doctor', data.referredBy || ''],
		['Age / Gender', `${data.age || ''} / ${data.gender || ''}`],
		['Date of Consultation', data.dateOfConsultation || ''],
		['Contact / Email', `${data.contact || ''} / ${data.email || ''}`],
	);
	
	// Add session information
	patientInfoBody.push(
		['Total Sessions Required', data.totalSessionsRequired != null ? String(data.totalSessionsRequired) : ''],
		['Remaining Sessions', data.remainingSessions != null ? String(data.remainingSessions) : '']
	);

	autoTable(doc, {
		startY: y,
		theme: 'grid',
		head: [['PATIENT INFORMATION', '']],
		body: patientInfoBody,
		headStyles,
		styles: baseStyles,
		columnStyles: { 0: { cellWidth: 60 } },
	});

	y = (doc as any).lastAutoTable.finalY + 6;

	autoTable(doc, {
		startY: y,
		theme: 'grid',
		head: [['ASSESSMENT OVERVIEW', '']],
		body: [
			['Complaints', data.complaints || ''],
			['Present History', data.presentHistory || ''],
			['Past History', data.pastHistory || ''],
			['Medical History', data.medicalHistory || ''],
			['Surgical History', data.surgicalHistory || ''],
			['Sleep Cycle', data.sleepCycle || ''],
			['Hydration', getHydrationDescriptor(data.hydration)],
			['Nutrition', data.nutrition || ''],
		],
		headStyles,
		styles: baseStyles,
		columnStyles: { 0: { cellWidth: 60 } },
	});

	y = (doc as any).lastAutoTable.finalY + 6;

	autoTable(doc, {
		startY: y,
		theme: 'grid',
		head: [['PAIN ASSESSMENT', '']],
		body: [
			['Site and Side', data.siteSide || ''],
			['Onset', data.onset || ''],
			['Duration', data.duration || ''],
			['Nature of Injury', data.natureOfInjury || ''],
			['Type of Pain', data.typeOfPain || data.painType || ''],
			['VAS Scale', getVasDescriptor(data.vasScale)],
			['Aggravating Factors', data.aggravatingFactor || ''],
			['Relieving Factors', data.relievingFactor || ''],
			['Mechanism of Injury', data.mechanismOfInjury || ''],
		],
		headStyles,
		styles: baseStyles,
		columnStyles: { 0: { cellWidth: 60 } },
	});

	y = (doc as any).lastAutoTable.finalY + 6;

	autoTable(doc, {
		startY: y,
		theme: 'grid',
		head: [['ON OBSERVATION', '']],
		body: [
			['Built', data.built || ''],
			['Posture', `${data.posture || ''}${data.postureManualNotes ? ` | Notes: ${data.postureManualNotes}` : ''}`],
			['Kinetisense Upload', data.postureFileName || '—'],
			['GAIT Analysis', `${data.gaitAnalysis || ''}${data.gaitManualNotes ? ` | Notes: ${data.gaitManualNotes}` : ''}`],
			['OptaGAIT Upload', data.gaitFileName || '—'],
			['Mobility Aids', data.mobilityAids || ''],
			['Local Observation', data.localObservation || ''],
			['Swelling', data.swelling || ''],
			['Muscle Wasting', data.muscleWasting || ''],
		],
		headStyles,
		styles: baseStyles,
		columnStyles: { 0: { cellWidth: 60 } },
	});

	y = (doc as any).lastAutoTable.finalY + 6;

	autoTable(doc, {
		startY: y,
		theme: 'grid',
		head: [['ON PALPATION', '']],
		body: [
			['Tenderness', data.tenderness || ''],
			['Warmth', data.warmth || ''],
			['Scar', data.scar || ''],
			['Crepitus', data.crepitus || ''],
			['Odema', data.odema || ''],
		],
		headStyles,
		styles: baseStyles,
		columnStyles: { 0: { cellWidth: 60 } },
	});

	y = (doc as any).lastAutoTable.finalY + 6;

	const romRows = formatJointData(data.rom);
	if (romRows.length) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['ON EXAMINATION — ROM (i)', 'Details']],
			body: romRows,
			headStyles,
			styles: baseStyles,
			columnStyles: { 0: { cellWidth: 60 } },
		});
		y = (doc as any).lastAutoTable.finalY + 6;
	}

	const mmtRows = formatJointData(data.mmt);
	if (mmtRows.length) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['ON EXAMINATION — Manual Muscle Testing (ii)', 'Details']],
			body: mmtRows,
			headStyles,
			styles: baseStyles,
			columnStyles: { 0: { cellWidth: 80 } },
		});
		y = (doc as any).lastAutoTable.finalY + 6;
	}

	const advancedRows: string[][] = [];
	if (data.specialTest) advancedRows.push(['Special Tests', data.specialTest]);
	if (data.differentialDiagnosis) advancedRows.push(['Differential Diagnosis', data.differentialDiagnosis]);
	if (data.finalDiagnosis) advancedRows.push(['Diagnosis', data.finalDiagnosis]);
	if (advancedRows.length) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['ADVANCED ASSESSMENT', '']],
			body: advancedRows,
			headStyles,
			styles: baseStyles,
			columnStyles: { 0: { cellWidth: 60 } },
		});
		y = (doc as any).lastAutoTable.finalY + 6;
	}

	doc.addPage();
	y = 12;

	const managementRows: string[][] = [];
	if (data.shortTermGoals) managementRows.push(['i) Short Term Goals', data.shortTermGoals]);
	if (data.longTermGoals) managementRows.push(['ii) Long Term Goals', data.longTermGoals]);
	if (data.rehabProtocol) managementRows.push(['iii) Rehab Protocol', data.rehabProtocol]);
	if (data.advice) managementRows.push(['iv) Advice', data.advice]);
	if (data.managementRemarks) managementRows.push(['v) Remarks', data.managementRemarks]);
	if (managementRows.length) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['PHYSIOTHERAPY MANAGEMENT', '']],
			body: managementRows,
			headStyles,
			styles: baseStyles,
			columnStyles: { 0: { cellWidth: 60 } },
		});
		y = (doc as any).lastAutoTable.finalY + 6;
	}

	if (data.followUpVisits?.length) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['VISIT', 'Pain Level', 'Findings / Progress']],
			body: data.followUpVisits.map((visit, index) => [
				visit.visitDate || `Visit ${index + 1}`,
				visit.painLevel || '',
				visit.findings || '',
			]),
			headStyles,
			styles: baseStyles,
			columnStyles: { 0: { cellWidth: 40 }, 1: { cellWidth: 40 } },
		});
		y = (doc as any).lastAutoTable.finalY + 6;
	}

	autoTable(doc, {
		startY: y,
		theme: 'grid',
		head: [['CURRENT STATUS']],
		body: [[buildCurrentStatus(data)]],
		headStyles,
		styles: { ...baseStyles, cellPadding: 3 },
	});

	y = (doc as any).lastAutoTable.finalY + 6;

	if (data.nextFollowUpDate || data.nextFollowUpTime) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['NEXT FOLLOW-UP DETAILS', '']],
			body: [
				['Date', data.nextFollowUpDate || ''],
				['Time', data.nextFollowUpTime || ''],
			],
			headStyles,
			styles: baseStyles,
			columnStyles: { 0: { cellWidth: 60 } },
		});
		y = (doc as any).lastAutoTable.finalY + 10;
	} else {
		y += 10;
	}

	doc.setFont('helvetica', 'bold');
	doc.setFontSize(10);
	doc.text('Physiotherapist Signature:', 12, y);
	doc.setFont('helvetica', 'normal');
	doc.text(data.physioName || '', 65, y);

	doc.setFont('helvetica', 'bold');
	doc.text('Reg. No:', 150, y);
	doc.setFont('helvetica', 'normal');
	doc.text(data.physioRegNo || '', 170, y);

	if (options?.forPrint) {
		// Generate PDF blob and open print window
		const pdfBlob = doc.output('blob');
		const pdfUrl = URL.createObjectURL(pdfBlob);
		
		// Open print window with PDF
		const printWindow = window.open(pdfUrl, '_blank');
		if (printWindow) {
			// Wait for PDF to load, then trigger print
			printWindow.onload = () => {
				setTimeout(() => {
					printWindow.print();
					// Clean up the URL after printing
					setTimeout(() => {
						URL.revokeObjectURL(pdfUrl);
					}, 1000);
				}, 500);
			};
		}
		return pdfUrl;
	} else {
		doc.save(`Physiotherapy_Report_${data.patientId}.pdf`);
	}
}
