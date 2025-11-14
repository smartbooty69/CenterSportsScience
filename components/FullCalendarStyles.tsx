'use client';

import { useEffect } from 'react';

export default function FullCalendarStyles() {
	useEffect(() => {
		// Load FullCalendar CSS
		const calendarLink = document.createElement('link');
		calendarLink.rel = 'stylesheet';
		calendarLink.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.19/index.global.min.css';
		document.head.appendChild(calendarLink);

		// Load Font Awesome CSS
		const fontAwesomeLink = document.createElement('link');
		fontAwesomeLink.rel = 'stylesheet';
		fontAwesomeLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css';
		fontAwesomeLink.integrity = 'sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==';
		fontAwesomeLink.crossOrigin = 'anonymous';
		fontAwesomeLink.referrerPolicy = 'no-referrer';
		document.head.appendChild(fontAwesomeLink);

		return () => {
			// Cleanup: remove the links when component unmounts
			const existingCalendarLink = document.querySelector(
				'link[href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.19/index.global.min.css"]'
			);
			if (existingCalendarLink) {
				existingCalendarLink.remove();
			}
			const existingFALink = document.querySelector(
				'link[href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"]'
			);
			if (existingFALink) {
				existingFALink.remove();
			}
		};
	}, []);

	return null;
}

