
// CommonJS version of the test script
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Run the actual test by transpiling the TypeScript file on the fly
try {
  console.log("[PAYPAL TEST] Starting PayPal payout test...");
  
  // Use esbuild to transpile and run the TS file (install if not already present)
  try {
    execSync('npx -y esbuild --version', { stdio: 'ignore' });
  } catch (e) {
    console.log("[PAYPAL TEST] Installing esbuild...");
    execSync('npm install -D esbuild', { stdio: 'inherit' });
  }
  
  // Create a temporary JS file from our TS file
  console.log("[PAYPAL TEST] Transpiling TypeScript file...");
  execSync('npx esbuild server/test-payout.ts --outfile=server/temp-test-payout.js --platform=node --format=cjs', 
    { stdio: 'inherit' });
  
  console.log("[PAYPAL TEST] Running the transpiled test...");
  execSync('node server/temp-test-payout.js', { stdio: 'inherit' });
  
  // Clean up the temporary file
  try {
    fs.unlinkSync(path.join(process.cwd(), 'server/temp-test-payout.js'));
  } catch (e) {
    console.warn("[PAYPAL TEST] Warning: Could not delete temporary file:", e.message);
  }
  
  console.log("[PAYPAL TEST] Test completed");
  
} catch (error) {
  console.error("[PAYPAL TEST] Test execution failed:", error.message);
  process.exit(1);
}
