import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, resolveColumns, rowsToCompanies } from './companies.js';

// A trimmed-down mirror of the real "Agreements" sheet header + a few rows,
// including the quoting quirks the live sheet actually contains.
const HEADER =
  '"№ договора (выбрать из выпадающего списка, подтягивается из таблицы Наири Agreements)",' +
  'Имя клиента из договора (автоматически),Сумма оплаты месячной в договоре (автоматически),' +
  'ՀՎՀՀ,Наименование клиента,Kлассификатор деятельности,Պայմանագրի կարգավիճակ,Бухгалтер,' +
  'Дата активации налогового кабинета,Бухгалтер ex';

const CSV = [
  HEADER,
  '1142,ADALYAT NUSSIPAYEVA,15000,40134148,ԱԴԱԼՅԱՏ ՆՈՒՍՍԻՊԱՅԵՎԱ ԱՁ,G47.19.0,Active ,Ստելլա,12.05.2024,Ստելլա',
  // Embedded quotes ("") and a comma inside a quoted classifier field.
  '28,"""AEON DEVELOPMENT"" LLC",100000,08224369,Ա-ԴԵՎԵԼՈՓՄԵՆԹ ՍՊԸ,"I56.10.1, food",Active ,Ստելլա,12.05.2024,Ստելլա/Տատյանա',
  // String agr_no + Inactive + a newline embedded in a quoted comment column.
  '"B-3142",ALINA KHORANOVA,10000,35278079,ԱԼԻՆԱ ԽՈՌԱՆՈՎԱ ԱՁ,"multi\nline",Inactive ,Օլյա,12.05.2024,Օլյա',
  // Blank agr_no → skipped.
  ',NO NUMBER,0,,,,,Active,,',
].join('\n') + '\n';

test('parseCsv handles quotes, escaped quotes, embedded commas and newlines', () => {
  const rows = parseCsv(CSV);
  // Header + 4 data rows (trailing newline does not add an empty row).
  assert.equal(rows.length, 5);
  assert.equal(rows[2][1], '"AEON DEVELOPMENT" LLC'); // escaped quotes unwrapped
  assert.equal(rows[2][5], 'I56.10.1, food'); // comma inside quotes preserved
  assert.equal(rows[3][5], 'multi\nline'); // newline inside quotes preserved
});

test('resolveColumns finds columns by header text (not position)', () => {
  const cols = resolveColumns(parseCsv(CSV)[0]);
  assert.equal(cols.agrNo, 0);
  assert.equal(cols.nameAgr, 1);
  assert.equal(cols.hvhh, 3);
  assert.equal(cols.nameTax, 4);
  assert.equal(cols.status, 6);
  assert.equal(cols.accountant, 7); // exact «Бухгалтер», not «Бухгалтер ex»
  assert.equal(cols.taxActivation, 8);
});

test('rowsToCompanies maps rows, trims status, skips blanks', () => {
  const companies = rowsToCompanies(parseCsv(CSV));
  assert.equal(companies.length, 3); // blank agr_no row dropped

  const first = companies[0];
  assert.equal(first.agr_no, '1142');
  assert.equal(first.name_agr, 'ADALYAT NUSSIPAYEVA');
  assert.equal(first.name_tax, 'ԱԴԱԼՅԱՏ ՆՈՒՍՍԻՊԱՅԵՎԱ ԱՁ');
  assert.equal(first.hvhh, '40134148');
  assert.equal(first.accountant, 'Ստելլա');
  assert.equal(first.status, 'Active'); // trailing space trimmed
  assert.equal(first.tax_activation_date, '12.05.2024');
  assert.equal(first.manager, null); // no manager column in the sheet

  assert.equal(companies[1].name_agr, '"AEON DEVELOPMENT" LLC');
  assert.equal(companies[2].agr_no, 'B-3142');
  assert.equal(companies[2].status, 'Inactive');
});

test('rowsToCompanies de-duplicates by agr_no (first wins)', () => {
  const rows = parseCsv(CSV);
  rows.push(['1142', 'DUPLICATE', '', '', '', '', 'Active', 'X', '', '']);
  const companies = rowsToCompanies(rows);
  assert.equal(companies.filter((c) => c.agr_no === '1142').length, 1);
  assert.equal(companies.find((c) => c.agr_no === '1142')?.name_agr, 'ADALYAT NUSSIPAYEVA');
});

test('rowsToCompanies throws when the key column is missing', () => {
  assert.throws(() => rowsToCompanies([['foo', 'bar'], ['1', '2']]), /№ договора/);
});
