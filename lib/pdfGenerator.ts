// Remove this line:
// import jsPDF from 'jspdf';

interface PatientReportData {
	patientName: string;
	patientId: string;
	referredBy?: string;
	age?: string;
	gender?: string;
	dateOfConsultation?: string;
	contact?: string;
	email?: string;
	chiefComplaint?: string;
	onsetType?: string;
	duration?: string;
	mechanismOfInjury?: string;
	painType?: string;
	painIntensity?: string;
	aggravatingFactor?: string;
	relievingFactor?: string;
	medicalHistory?: string;
	surgicalHistory?: string;
	medications?: string;
	clinicalDiagnosis?: string;
	treatmentPlan?: Array<{ therapy: string; frequency: string; remarks: string }>;
	followUpVisits?: Array<{ visitDate: string; painLevel: string; findings: string }>;
	currentPainStatus?: string;
	currentRom?: string;
	currentStrength?: string;
	currentFunctionalAbility?: string;
	complianceWithHEP?: string;
	recommendations?: string;
	physiotherapistRemarks?: string;
	physioName?: string;
	physioRegNo?: string;
}

// Use dynamic import instead of static import
export async function generatePhysiotherapyReportPDF(data: PatientReportData): Promise<void> {
	// Dynamic import for client-side only
	const { default: jsPDF } = await import('jspdf');
	
	const doc = new jsPDF();
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 15;
	let yPos = margin;
	const lineHeight = 7;
	const sectionSpacing = 10;

	// Header
	doc.setFontSize(18);
	doc.setTextColor(0, 51, 102); // Dark blue
	doc.setFont('helvetica', 'bold');
	doc.text('CENTRE FOR SPORTS SCIENCE', pageWidth / 2, yPos, { align: 'center' });
	yPos += 8;

	doc.setFontSize(14);
	doc.text('PHYSIOTHERAPY CONSULTATION & FOLLOW-UP REPORT', pageWidth / 2, yPos, { align: 'center' });
	doc.setDrawColor(0, 51, 102);
	doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
	yPos += sectionSpacing + 5;

	// Section 1: Clinical History (Patient Information)
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFontSize(11);
	doc.setFont('helvetica', 'bold');
	doc.text('1. Clinical History', margin + 2, yPos + 4.5);
	yPos += 8;

	doc.setTextColor(0, 0, 0);
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	
	const patientInfo = [
		['Patient Name:', data.patientName || ''],
		['Patient ID:', data.patientId || ''],
		['Referred By / Doctor:', data.referredBy || ''],
		['Age / Gender:', `${data.age || ''} / ${data.gender || ''}`],
		['Date of Consultation:', data.dateOfConsultation || ''],
		['Contact / Email:', `${data.contact || ''} / ${data.email || ''}`],
	];

	let xPos = margin;
	patientInfo.forEach(([label, value]) => {
		doc.setFont('helvetica', 'bold');
		doc.text(label, xPos, yPos);
		doc.setFont('helvetica', 'normal');
		const textWidth = doc.getTextWidth(value);
		doc.text(value, xPos + 50, yPos);
		
		if (xPos === margin + 90) {
			xPos = margin;
			yPos += lineHeight;
		} else {
			xPos += 90;
		}
	});
	yPos += sectionSpacing;

	// Section 1: Clinical History (Detailed)
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.text('1. Clinical History', margin + 2, yPos + 4.5);
	yPos += 8;

	doc.setTextColor(0, 0, 0);
	doc.setFont('helvetica', 'normal');
	
	const clinicalDetails = [
		['Chief Complaint:', data.chiefComplaint || ''],
		['Onset & Duration:', `${data.onsetType || ''} / ${data.duration || ''}`],
		['Mechanism of Injury:', data.mechanismOfInjury || ''],
		['Pain Characteristics:', `${data.painType || ''}, Intensity: ${data.painIntensity || ''}`],
		['Aggravating Factors:', data.aggravatingFactor || ''],
		['Relieving Factors:', data.relievingFactor || ''],
		['Medical / Surgical History:', `${data.medicalHistory || ''} / ${data.surgicalHistory || ''}`],
		['Medications:', data.medications || ''],
	];

	clinicalDetails.forEach(([label, value]) => {
		doc.setFont('helvetica', 'bold');
		doc.text(label, margin, yPos);
		doc.setFont('helvetica', 'normal');
		const lines = doc.splitTextToSize(value, pageWidth - margin - 60);
		doc.text(lines, margin + 55, yPos);
		yPos += lineHeight * lines.length;
	});
	yPos += sectionSpacing;

	// Section 3: Diagnosis
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.text('3. Diagnosis/Impression', margin + 2, yPos + 4.5);
	yPos += 8;

	doc.setTextColor(0, 0, 0);
	doc.setFont('helvetica', 'normal');
	doc.setFont('helvetica', 'bold');
	doc.text('Clinical Diagnosis:', margin, yPos);
	doc.setFont('helvetica', 'normal');
	const diagnosisLines = doc.splitTextToSize(data.clinicalDiagnosis || '', pageWidth - 2 * margin);
	doc.text(diagnosisLines, margin, yPos + lineHeight);
	yPos += lineHeight * (diagnosisLines.length + 1) + sectionSpacing;

	// Section 4: Treatment Plan
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.text('4. Treatment Plan - Initial Consultation', margin + 2, yPos + 4.5);
	yPos += 8;

	if (data.treatmentPlan && data.treatmentPlan.length > 0) {
		const tableTop = yPos;
		const colWidths = [70, 50, 60];
		const rowHeight = 8;
		
		// Table header
		doc.setFillColor(240, 240, 240);
		doc.rect(margin, tableTop, colWidths[0], rowHeight, 'F');
		doc.rect(margin + colWidths[0], tableTop, colWidths[1], rowHeight, 'F');
		doc.rect(margin + colWidths[0] + colWidths[1], tableTop, colWidths[2], rowHeight, 'F');
		
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(9);
		doc.text('Therapy / Modality', margin + 2, tableTop + 5);
		doc.text('Frequency / Duration', margin + colWidths[0] + 2, tableTop + 5);
		doc.text('Remarks', margin + colWidths[0] + colWidths[1] + 2, tableTop + 5);
		
		yPos = tableTop + rowHeight;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		
		const therapies = ['IF1 / TENS / Ultrasound', 'Manual Therapy / Mobilization', 'Stretching / Strengthening', 'Posture Correction / Ergonomics', 'Home Exercise Program (HEP)'];
		therapies.forEach((therapy, idx) => {
			const plan = data.treatmentPlan?.[idx];
			doc.text(therapy, margin + 2, yPos + 5);
			doc.text(plan?.frequency || '', margin + colWidths[0] + 2, yPos + 5);
			doc.text(plan?.remarks || '', margin + colWidths[0] + colWidths[1] + 2, yPos + 5);
			doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);
			yPos += rowHeight;
		});
		yPos += sectionSpacing;
	}

	// Section 5: Follow-Up Visit Summary
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.text('5. Follow-Up Visit Summary', margin + 2, yPos + 4.5);
	yPos += 8;

	if (data.followUpVisits && data.followUpVisits.length > 0) {
		const tableTop = yPos;
		const colWidths = [50, 50, 90];
		const rowHeight = 8;
		
		// Table header
		doc.setFillColor(240, 240, 240);
		doc.rect(margin, tableTop, colWidths[0], rowHeight, 'F');
		doc.rect(margin + colWidths[0], tableTop, colWidths[1], rowHeight, 'F');
		doc.rect(margin + colWidths[0] + colWidths[1], tableTop, colWidths[2], rowHeight, 'F');
		
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(9);
		doc.text('Visit Date', margin + 2, tableTop + 5);
		doc.text('Pain Level (VAS)', margin + colWidths[0] + 2, tableTop + 5);
		doc.text('Findings/Progress', margin + colWidths[0] + colWidths[1] + 2, tableTop + 5);
		
		yPos = tableTop + rowHeight;
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		
		[1, 2, 3, 4].forEach((visitNum) => {
			const visit = data.followUpVisits?.[visitNum - 1];
			doc.text(`Visit ${visitNum}`, margin + 2, yPos + 5);
			doc.text(visit?.painLevel || '', margin + colWidths[0] + 2, yPos + 5);
			doc.text(visit?.findings || '', margin + colWidths[0] + colWidths[1] + 2, yPos + 5);
			doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);
			yPos += rowHeight;
		});
		yPos += sectionSpacing;
	}

	// Section 6: Current Status
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.text('6. Current Status (as on last visit)', margin + 2, yPos + 4.5);
	yPos += 8;

	doc.setTextColor(0, 0, 0);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	
	const statusItems = [
		`• Pain: ${data.currentPainStatus || ''}`,
		`• ROM: ${data.currentRom || ''}`,
		`• Strength: ${data.currentStrength || ''}`,
		`• Functional Ability: ${data.currentFunctionalAbility || ''}`,
		`• Compliance with HEP: ${data.complianceWithHEP || ''}`,
	];

	statusItems.forEach(item => {
		doc.text(item, margin, yPos);
		yPos += lineHeight;
	});
	yPos += sectionSpacing;

	// Section 7: Recommendations
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.text('7. Recommendations', margin + 2, yPos + 4.5);
	yPos += 8;

	doc.setTextColor(0, 0, 0);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	const recLines = doc.splitTextToSize(data.recommendations || '', pageWidth - 2 * margin);
	doc.text(recLines, margin, yPos);
	yPos += lineHeight * recLines.length + sectionSpacing;

	// Section 8: Physiotherapist's Remarks
	doc.setFillColor(0, 102, 204);
	doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
	doc.setTextColor(255, 255, 255);
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(11);
	doc.text('8. Physiotherapist\'s Remarks', margin + 2, yPos + 4.5);
	yPos += 8;

	doc.setTextColor(0, 0, 0);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(10);
	const remarksLines = doc.splitTextToSize(data.physiotherapistRemarks || '', pageWidth - 2 * margin);
	doc.text(remarksLines, margin, yPos);
	yPos += lineHeight * remarksLines.length + sectionSpacing;

	// Footer
	const footerY = pageHeight - 20;
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.text('Physiotherapist Name & Signature:', margin, footerY);
	doc.text(data.physioName || '', margin + 60, footerY);
	
	doc.text('Reg. No:', pageWidth - margin - 30, footerY);
	doc.text(data.physioRegNo || '', pageWidth - margin - 15, footerY);

	// Save PDF
	doc.save(`Physiotherapy_Report_${data.patientId}_${new Date().toISOString().split('T')[0]}.pdf`);
}
