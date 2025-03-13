
// This script loads the TypeScript compiler and runs the test
import { spawn } from 'child_process';

// Run ts-node with ESM mode
const process = spawn('npx', [
  'ts-node', 
  '--esm', 
  '--transpile-only', 
  'server/test-payout.ts'
]);

process.stdout.on('data', (data) => {
  console.log(`${data}`);
});

process.stderr.on('data', (data) => {
  console.error(`${data}`);
});

process.on('close', (code) => {
  console.log(`Child process exited with code ${code}`);
});
