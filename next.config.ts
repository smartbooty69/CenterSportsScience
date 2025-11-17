import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
	turbopack: {
		root: path.join(__dirname),
	},
	transpilePackages: ['jspdf-autotable', 'jspdf'],
};

export default nextConfig;
