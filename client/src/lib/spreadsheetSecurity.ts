const SPREADSHEET_FORMULA_PREFIX_PATTERN = /^[=+\-@]/

export function neutralizeSpreadsheetFormulaText(value: string) {
  return SPREADSHEET_FORMULA_PREFIX_PATTERN.test(value) ? `'${value}` : value
}
