'use client';

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

export type ReportSection = 
	| 'patientInformation'
	| 'assessmentOverview'
	| 'painAssessment'
	| 'onObservation'
	| 'onPalpation'
	| 'rom'
	| 'mmt'
	| 'advancedAssessment'
	| 'physiotherapyManagement'
	| 'followUpVisits'
	| 'currentStatus'
	| 'nextFollowUp'
	| 'signature';

export async function generatePhysiotherapyReportPDF(
	data: PatientReportData,
	options?: { forPrint?: boolean; sections?: ReportSection[] }
): Promise<string | void> {
	const [{ default: jsPDF }, autoTableModule] = await Promise.all([
		import('jspdf'),
		import('jspdf-autotable'),
	]);

	// jspdf-autotable v5 exports the function as default
	const autoTable = (autoTableModule as any).default || autoTableModule;

	// If sections are specified, only include those sections. Otherwise, include all.
	const includeSection = (section: ReportSection): boolean => {
		if (!options?.sections) return true; // Include all if no sections specified
		if (!Array.isArray(options.sections)) return true; // Include all if sections is not an array
		return options.sections.includes(section);
	};

	// Load header configuration based on patient type
	const patientTypeUpper = data.patientType?.toUpperCase() || '';
	const isDYES = patientTypeUpper === 'DYES';
	const headerType = isDYES ? 'reportDYES' : 'reportNonDYES';
	
	const { getHeaderConfig, getDefaultHeaderConfig } = await import('./headerConfig');
	const headerConfig = await getHeaderConfig(headerType);
	const defaultConfig = getDefaultHeaderConfig(headerType);
	
	// Use configured values or fall back to defaults
	const headerSettings = {
		mainTitle: headerConfig?.mainTitle || defaultConfig.mainTitle || 'CENTRE FOR SPORTS SCIENCE',
		subtitle: headerConfig?.subtitle || defaultConfig.subtitle || 'PHYSIOTHERAPY CONSULTATION & FOLLOW-UP REPORT',
		contactInfo: headerConfig?.contactInfo || defaultConfig.contactInfo || '',
		associationText: headerConfig?.associationText || defaultConfig.associationText || '',
		govermentOrder: headerConfig?.govermentOrder || defaultConfig.govermentOrder || '',
		leftLogo: headerConfig?.leftLogo || null,
		rightLogo: headerConfig?.rightLogo || null,
	};

	const doc = new jsPDF('p', 'mm', 'a4');
	const pageWidth = 210; // A4 width in mm
	const pageMargin = 10; // Left and right margin
	const logoWidth = 35;
	const logoHeight = 18;
	const leftLogoX = pageMargin; // Left logo aligned to left margin
	const rightLogoX = pageWidth - pageMargin - logoWidth; // Right logo aligned to right margin
	const pageCenterX = pageWidth / 2; // Center of full page width (105mm)

	// All elements (logo, text, logo) aligned in single row at same height
	const headerY = 10; // Starting Y position - same for all elements
	const headerEndY = headerY + logoHeight; // Ending Y position - same for all elements

	// Load and add left logo (from config or default)
	if (headerSettings.leftLogo) {
		try {
			// If it's a base64 string, use it directly; otherwise try to fetch
			if (headerSettings.leftLogo.startsWith('data:')) {
				doc.addImage(headerSettings.leftLogo, 'JPEG', leftLogoX, headerY, logoWidth, logoHeight);
			} else {
				const logoResponse = await fetch(headerSettings.leftLogo);
				if (logoResponse.ok) {
					const logoBlob = await logoResponse.blob();
					const logoDataUrl = await new Promise<string>((resolve) => {
						const reader = new FileReader();
						reader.onloadend = () => resolve(reader.result as string);
						reader.readAsDataURL(logoBlob);
					});
					doc.addImage(logoDataUrl, 'JPEG', leftLogoX, headerY, logoWidth, logoHeight);
				}
			}
		} catch (error) {
			console.warn('Could not load configured left logo, trying default:', error);
			// Fallback to default logo
			try {
				const centerLogoResponse = await fetch('/CenterSportsScience_logo.jpg');
				if (centerLogoResponse.ok) {
					const centerLogoBlob = await centerLogoResponse.blob();
					const centerLogoDataUrl = await new Promise<string>((resolve) => {
						const reader = new FileReader();
						reader.onloadend = () => resolve(reader.result as string);
						reader.readAsDataURL(centerLogoBlob);
					});
					doc.addImage(centerLogoDataUrl, 'JPEG', leftLogoX, headerY, logoWidth, logoHeight);
				}
			} catch (fallbackError) {
				console.warn('Could not load default left logo:', fallbackError);
			}
		}
	} else {
		// Use default logo
		try {
			const centerLogoResponse = await fetch('/CenterSportsScience_logo.jpg');
			if (centerLogoResponse.ok) {
				const centerLogoBlob = await centerLogoResponse.blob();
				const centerLogoDataUrl = await new Promise<string>((resolve) => {
					const reader = new FileReader();
					reader.onloadend = () => resolve(reader.result as string);
					reader.readAsDataURL(centerLogoBlob);
				});
				doc.addImage(centerLogoDataUrl, 'JPEG', leftLogoX, headerY, logoWidth, logoHeight);
			}
		} catch (error) {
			console.warn('Could not load Center Sports Science logo:', error);
		}
	}

	// Load and add right logo (from config or default)
	if (headerSettings.rightLogo) {
		try {
			// If it's a base64 string, use it directly; otherwise try to fetch
			if (headerSettings.rightLogo.startsWith('data:')) {
				doc.addImage(headerSettings.rightLogo, 'JPEG', rightLogoX, headerY, logoWidth, logoHeight);
			} else {
				const logoResponse = await fetch(headerSettings.rightLogo);
				if (logoResponse.ok) {
					const logoBlob = await logoResponse.blob();
					const logoDataUrl = await new Promise<string>((resolve) => {
						const reader = new FileReader();
						reader.onloadend = () => resolve(reader.result as string);
						reader.readAsDataURL(logoBlob);
					});
					doc.addImage(logoDataUrl, 'JPEG', rightLogoX, headerY, logoWidth, logoHeight);
				}
			}
		} catch (error) {
			console.warn('Could not load configured right logo, trying default:', error);
			// Fallback to default logo
			const rightLogoPath = isDYES ? '/Dyes_logo.jpg' : '/sixs_logo.jpg';
			try {
				const rightLogoResponse = await fetch(rightLogoPath);
				if (rightLogoResponse.ok) {
					const rightLogoBlob = await rightLogoResponse.blob();
					const rightLogoDataUrl = await new Promise<string>((resolve) => {
						const reader = new FileReader();
						reader.onloadend = () => resolve(reader.result as string);
						reader.readAsDataURL(rightLogoBlob);
					});
					doc.addImage(rightLogoDataUrl, 'JPEG', rightLogoX, headerY, logoWidth, logoHeight);
				}
			} catch (fallbackError) {
				console.warn('Could not load default right logo:', fallbackError);
			}
		}
	} else {
		// Use default logo
		const rightLogoPath = isDYES ? '/Dyes_logo.jpg' : '/sixs_logo.jpg';
		try {
			const rightLogoResponse = await fetch(rightLogoPath);
			if (rightLogoResponse.ok) {
				const rightLogoBlob = await rightLogoResponse.blob();
				const rightLogoDataUrl = await new Promise<string>((resolve) => {
					const reader = new FileReader();
					reader.onloadend = () => resolve(reader.result as string);
					reader.readAsDataURL(rightLogoBlob);
				});
				doc.addImage(rightLogoDataUrl, 'JPEG', rightLogoX, headerY, logoWidth, logoHeight);
			}
		} catch (error) {
			console.warn('Could not load right logo:', error);
		}
	}

	// Calculate text baseline to center it vertically within the logo height
	// headerY + (logoHeight / 2) centers the text baseline in the middle of the logo
	const textBaselineY = headerY + (logoHeight / 2);
	
	// Title - Centered vertically within the same row as logos (from config)
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(20);
	doc.setTextColor(0, 51, 102);
	// Center text across full page width (flexbox-like behavior: text centered in full width)
	doc.text(headerSettings.mainTitle || 'CENTRE FOR SPORTS SCIENCE', pageCenterX, textBaselineY, { align: 'center' });
	
	// Phone and address - positioned just below "CENTRE FOR SPORTS SCIENCE"
	let y = headerEndY + 4; // Start just below the header row
	
	// Add contact information for PAID, VIP, GETHNA patients, or DYES association text for DYES patients
	if (isDYES) {
		// DYES association text - positioned just below the title (from config)
		if (headerSettings.associationText) {
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(9);
			doc.setTextColor(0, 0, 0);
			// Center text across full page width
			doc.text(headerSettings.associationText, pageCenterX, y, { align: 'center' });
			y += 4;
		}
		if (headerSettings.govermentOrder) {
			doc.setFontSize(8);
			doc.text(headerSettings.govermentOrder, pageCenterX, y, { align: 'center' });
			y += 4;
		}
		y += 6; // One line space
	} else {
		// For all non-DYES patients (PAID, VIP, GETHNA, or any other type), show phone and address just below title (from config)
		if (headerSettings.contactInfo) {
			doc.setFont('helvetica', 'normal');
			doc.setFontSize(7); // Smaller font size
			doc.setTextColor(0, 0, 0);
			const contactLines = doc.splitTextToSize(headerSettings.contactInfo, 180);
			// Center text across full page width - positioned just below "CENTRE FOR SPORTS SCIENCE"
			doc.text(contactLines, pageCenterX, y, { align: 'center' });
			y += contactLines.length * 3.5; // Adjust spacing based on number of lines
			y += 2.5; // Additional spacing to make it one line space total
		}
	}
	
	// Next header in green color (from config)
	if (headerSettings.subtitle) {
		doc.setFontSize(12);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(0, 128, 0); // Green color
		// Center text across full page width
		doc.text(headerSettings.subtitle, pageCenterX, y, { align: 'center' });
		y += 6;
	}

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

	if (includeSection('patientInformation')) {
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
	}

	if (includeSection('assessmentOverview')) {
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
	}

	if (includeSection('painAssessment')) {
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
	}

	if (includeSection('onObservation')) {
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
	}

	if (includeSection('onPalpation')) {
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
	}

	if (includeSection('rom')) {
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
	}

	if (includeSection('mmt')) {
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
	}

	if (includeSection('advancedAssessment')) {
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
	}

	if (includeSection('physiotherapyManagement') || includeSection('followUpVisits') || includeSection('currentStatus') || includeSection('nextFollowUp') || includeSection('signature')) {
		doc.addPage();
		y = 12;
	}

	if (includeSection('physiotherapyManagement')) {
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
	}

	if (includeSection('followUpVisits') && data.followUpVisits?.length) {
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

	if (includeSection('currentStatus')) {
		autoTable(doc, {
			startY: y,
			theme: 'grid',
			head: [['CURRENT STATUS']],
		body: [[buildCurrentStatus(data)]],
		headStyles,
		styles: { ...baseStyles, cellPadding: 3 },
		});
		y = (doc as any).lastAutoTable.finalY + 6;
	}

	if (includeSection('nextFollowUp') && (data.nextFollowUpDate || data.nextFollowUpTime)) {
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
	} else if (includeSection('nextFollowUp')) {
		y += 10;
	}

	if (includeSection('signature')) {
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(10);
		doc.text('Physiotherapist Signature:', 12, y);
		doc.setFont('helvetica', 'normal');
		doc.text(data.physioName || '', 65, y);

		doc.setFont('helvetica', 'bold');
		doc.text('Reg. No:', 150, y);
		doc.setFont('helvetica', 'normal');
		doc.text(data.physioRegNo || '', 170, y);
	}

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
