const { seedInitialMachines } = require('../services/machine.service');

async function runSeed() {
  console.log('====================================================');
  console.log('       CAT SMART OPERATOR - MACHINE INITIALIZER     ');
  console.log('====================================================');
  console.log('Verifying initial machines in Firestore...');

  try {
    const results = await seedInitialMachines();
    console.log('\nSeed Results:');
    results.forEach((r) => {
      console.log(` - Machine: ${r.machineId} => Status: ${r.action}`);
    });
    console.log('\nInitialization complete.');
    process.exit(0);
  } catch (error) {
    console.error('\nSeed failed with error:', error.message);
    process.exit(1);
  }
}

runSeed();
