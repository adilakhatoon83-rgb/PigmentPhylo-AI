import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { spawn, execSync } from 'child_process';
import fs from 'fs';

// Spawn Python FastAPI backend on port 8000 in development mode
if (process.env.NODE_ENV !== 'production' && !(globalThis as any).__backendStarted) {
  (globalThis as any).__backendStarted = true;
  try {
    console.log('>>> Preparing to verify/install Python dependencies from requirements.txt...');
    const env = { ...process.env, PIP_BREAK_SYSTEM_PACKAGES: '1' };
    
    // Read and parse requirements.txt
    let requirements: string[] = [];
    try {
      const content = fs.readFileSync(path.resolve(__dirname, 'requirements.txt'), 'utf8');
      requirements = content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line && !line.startsWith('#'));
    } catch (fsErr) {
      console.warn('>>> Could not read requirements.txt directly, using static list.', fsErr);
      requirements = [
        'fastapi>=0.100.0',
        'uvicorn>=0.22.0',
        'pydantic>=2.0.0',
        'PyJWT>=2.8.0',
        'requests>=2.31.0',
        'python-multipart>=0.0.6',
        'bcrypt>=4.0.1',
        'pdfplumber>=0.10.0',
        'pinecone-client>=3.0.0',
        'boto3>=1.28.0'
      ];
    }

    console.log('>>> Installing requirements individually to prevent heavy/optional dependency failures from blocking app launch...');
    for (const req of requirements) {
      try {
        console.log(`>>> Installing/Checking dependency: ${req}...`);
        execSync(`python3 -m pip install --break-system-packages "${req}"`, { env, stdio: 'inherit' });
      } catch (err: any) {
        console.warn(`>>> python3 -m pip failed to install ${req}, trying pip3 directly...`);
        try {
          execSync(`pip3 install --break-system-packages "${req}"`, { env, stdio: 'inherit' });
        } catch (pipErr: any) {
          console.error(`>>> Warning: FAILED to install library ${req}:`, pipErr.message);
          console.log(`>>> The application will still try to start using runtime fallbacks for ${req}.`);
        }
      }
    }
    console.log('>>> Python dependencies verification phase finished.');
  } catch (err: any) {
    console.error('>>> Critical: Unexpected exception in dependency installer:', err.message);
  }

  console.log('>>> Spawning Python FastAPI backend on port 8000...');
  const backendProcess = spawn('python3', ['-m', 'uvicorn', 'main:app', '--port', '8000', '--host', '127.0.0.1'], {
    stdio: 'inherit',
    shell: true,
  });

  backendProcess.on('error', (err) => {
    console.error('>>> Critical: Failed to start Python backend:', err);
  });

  process.on('exit', () => {
    if (backendProcess) backendProcess.kill();
  });
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      proxy: {
        '/auth': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/chat': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/notes': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/corpus': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
