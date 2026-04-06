import { describe, expect, test } from '@jest/globals';
import {
  cssEscapeAttr,
  csvEscape,
  escapeHtml,
  getReportStandards,
  rowsToCsv,
  safeFilePart
} from '../docs/app/shared.js';

describe('shared helpers', () => {
  test('escapeHtml escapes reserved HTML characters', () => {
    expect(escapeHtml(`<tag attr="x">'&`)).toBe('&lt;tag attr=&quot;x&quot;&gt;&#39;&amp;');
  });

  test('cssEscapeAttr escapes double quotes for attribute selectors', () => {
    expect(cssEscapeAttr('a"b')).toBe('a\\"b');
  });

  test('safeFilePart normalizes unsafe file-name fragments', () => {
    expect(safeFilePart('  ontology report: v1/owl  ')).toBe('ontology_report_v1_owl');
  });

  test('csvEscape and rowsToCsv preserve commas, quotes, and newlines', () => {
    expect(csvEscape('a,"b"')).toBe('"a,""b"""');
    expect(rowsToCsv([['id', 'value'], ['1', 'line 1\nline 2']])).toBe(
      'id,value\n1,"line 1\nline 2"\n'
    );
  });

  test('getReportStandards returns a safe empty array for missing reports', () => {
    expect(getReportStandards(null)).toEqual([]);
    expect(getReportStandards({ standards: [{ id: 'STD:1' }] })).toEqual([{ id: 'STD:1' }]);
  });
});
