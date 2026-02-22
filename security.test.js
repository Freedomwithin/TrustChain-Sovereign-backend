const { calculateGini, calculateHHI } = require('./integrityEngine');

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL:', message);
    process.exit(1);
  }
}

console.log('🛡️ Starting Security Adversarial Tests...');

// 1. Math Validation - Gini Edge Cases
function testGiniMath() {
  console.log('--- Testing Gini Math ---');

  // Array of zeros
  const zeros = [0, 0, 0, 0];
  assert(calculateGini(zeros) === 0, 'calculateGini with zeros should return 0, not NaN');
  console.log('✅ PASS: Gini zeros handled');

  // Empty array
  const empty = [];
  assert(calculateGini(empty) === 0, 'calculateGini with empty array should return 0');
  console.log('✅ PASS: Gini empty handled');

  // Single value
  const single = [100];
  assert(calculateGini(single) === 0, 'calculateGini with single value should return 0');
  console.log('✅ PASS: Gini single value handled');

  // Dust transactions (very small values vs large ones)
  const dust = [1000000, 1, 1, 1]; // 1 SOL vs 3 lamports
  const giniDust = calculateGini(dust);
  assert(giniDust > 0.7, `Gini for dust transactions should be high, got ${giniDust}`);
  console.log('✅ PASS: Gini dust concentration detected');
}

// 2. Math Validation - HHI Edge Cases
function testHHIMath() {
  console.log('--- Testing HHI Math ---');

  // Array of zeros
  const zeros = [0, 0, 0, 0];
  assert(calculateHHI(zeros) === 0, 'calculateHHI with zeros should return 0');
  console.log('✅ PASS: HHI zeros handled');

  // Total concentration
  const concentrated = [100, 0, 0, 0];
  const hhi = calculateHHI(concentrated);
  assert(Math.abs(hhi - 1.0) < 0.001, `HHI for total concentration should be 1.0, got ${hhi}`);
  console.log('✅ PASS: HHI total concentration handled');
}

testGiniMath();
testHHIMath();

console.log('🛡️ All Security Adversarial Tests PASSED!');
