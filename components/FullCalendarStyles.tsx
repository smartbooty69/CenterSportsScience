'use client';

import { useEffect } from 'react';

export default function FullCalendarStyles() {
	useEffect(() => {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.19/index.global.min.css';
		document.head.appendChild(link);

		return () => {
			// Cleanup: remove the link when component unmounts
			const existingLink = document.querySelector(
				'link[href="https://cdn.jsdelivr.net/npm/fullcalendar@6.1.19/index.global.min.css"]'
			);
			if (existingLink) {
				existingLink.remove();
			}
		};
	}, []);

	return null;
}

