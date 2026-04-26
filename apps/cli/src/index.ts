#!/usr/bin/env node

const printHelp = (): void => {
  console.log('Chaos Internet Simulator CLI');
  console.log('');
  console.log('Usage:');
  console.log('  chaos-net <command>');
  console.log('');
  console.log('Commands:');
  console.log('  start');
  console.log('  off');
  console.log('  status');
  console.log('  profile <profileName>');
  console.log('  logs');
};

const main = (): void => {
  const [command] = process.argv.slice(2);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  console.log(`Command "${command}" is not implemented yet.`);
  printHelp();
  process.exitCode = 1;
};

main();
