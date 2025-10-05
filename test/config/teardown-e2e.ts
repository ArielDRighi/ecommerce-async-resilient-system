/**
 * Global teardown for E2E tests
 * Runs once after all test suites
 */

export default async () => {
  // Wait for any pending async operations (sagas, jobs, etc) to complete
  // This prevents "Driver not Connected" errors from background processes
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // eslint-disable-next-line no-console
  console.log('\n✅ E2E Test Suite - Global Teardown');
  // eslint-disable-next-line no-console
  console.log('All tests completed!\n');
};
