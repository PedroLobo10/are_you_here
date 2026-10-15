import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',port:5173},test:{include:['tests/**/*.test.ts']},build:{rollupOptions:{output:{manualChunks:(id)=>{if(/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'react-vendor';if(/node_modules\/(recharts|d3-|victory-vendor)/.test(id))return 'charts';if(id.includes('node_modules/pdfjs-dist/'))return 'pdf';}}}}});
