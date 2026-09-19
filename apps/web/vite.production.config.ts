import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({plugins:[vue()],build:{outDir:'dist-production',emptyOutDir:true,sourcemap:false,rollupOptions:{input:'full.html'}}});
