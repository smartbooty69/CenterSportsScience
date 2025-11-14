'use client';

import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
	Chart as ChartJS,
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	BarElement,
	ArcElement,
	Title,
	Tooltip,
	Legend,
} from 'chart.js';

ChartJS.register(
	CategoryScale,
	LinearScale,
	PointElement,
	LineElement,
	BarElement,
	ArcElement,
	Title,
	Tooltip,
	Legend
);

interface StatsChartProps {
	type: 'line' | 'bar' | 'doughnut';
	data: {
		labels: string[];
		datasets: Array<{
			label: string;
			data: number[];
			backgroundColor?: string | string[];
			borderColor?: string;
			borderWidth?: number;
		}>;
	};
	title?: string;
	height?: number;
}

export default function StatsChart({ type, data, title, height = 200 }: StatsChartProps) {
	const options = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: {
				position: 'top' as const,
			},
			title: title
				? {
						display: true,
						text: title,
					}
				: undefined,
		},
	};

	return (
		<div style={{ height: `${height}px` }}>
			{type === 'line' && <Line data={data} options={options} />}
			{type === 'bar' && <Bar data={data} options={options} />}
			{type === 'doughnut' && <Doughnut data={data} options={options} />}
		</div>
	);
}

