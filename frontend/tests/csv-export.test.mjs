import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/csv.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { encodeCsv, escapeCsvCell } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

test('regular field is quoted', () => {
  assert.equal(escapeCsvCell('Project A'), '"Project A"');
});
test('quotes and line breaks are escaped correctly', () => {
  assert.equal(escapeCsvCell('Project "A"\nUpdated'), '"Project ""A""\nUpdated"');
});
for (const prefix of ['=', '+', '-', '@', ' =', '\t=', '\r\n=', '\n  @']) {
  test('potential spreadsheet formula escaped: ' + JSON.stringify(prefix), () => {
    const value = prefix + 'SUM(1,2)';
    assert.equal(escapeCsvCell(value), '"' + "'" + value + '"');
  });
}
test('ordinary numeric values are retained', () => {
  assert.equal(escapeCsvCell(24), '"24"');
  assert.equal(escapeCsvCell('HTTPS://matedesk.pro'), '"HTTPS://matedesk.pro"');
});
test('CSV encoder preserves column count and sanitizes formulas', () => {
  assert.equal(encodeCsv([['Section', 'Value'], ['Project', '=CMD()']]),
    '"Section","Value"\r\n"Project","\'=CMD()"');
});
