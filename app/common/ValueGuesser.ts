import {DocData} from 'app/common/DocData';
import {DocumentSettings} from 'app/common/DocumentSettings';
import {countIf} from 'app/common/gutil';
import {NumberFormatOptions} from 'app/common/NumberFormat';
import NumberParse from 'app/common/NumberParse';
import {dateTimeWidgetOptions, guessDateFormat} from 'app/common/parseDate';
import {createFormatter} from 'app/common/ValueFormatter';
import {createParserRaw, ValueParser} from 'app/common/ValueParser';
import * as moment from 'moment-timezone';

interface GuessedColInfo {
  type: string;
  widgetOptions?: object;
}

export interface GuessResult {
  values?: any[];
  colInfo: GuessedColInfo;
}

/**
 * Class for guessing if an array of values should be interpreted as a specific column type.
 * T is the type of values that strings should be parsed to and is stored in the column.
 */
abstract class ValueGuesser<T> {
  /**
   * Guessed column type and maybe widget options.
   */
  public abstract colInfo(): GuessedColInfo;

  /**
   * Parse a single string to a typed value in such a way that formatting the value returns the original string.
   * If the string cannot be parsed, return the original string.
   */
  public abstract parse(value: string): T | string;

  /**
   * Attempt to parse at least 90% the string values losslessly according to the guessed colInfo.
   * Return null if this cannot be done.
   */
  public guess(values: Array<string | null>, docSettings: DocumentSettings): GuessResult | null {
    const colInfo = this.colInfo();
    const {type, widgetOptions} = colInfo;
    const formatter = createFormatter(type, widgetOptions || {}, docSettings);
    const result: any[] = [];
    // max number of non-parsed strings to allow before giving up
    const maxUnparsed = countIf(values, v => Boolean(v)) * 0.1;
    let unparsed = 0;

    for (const value of values) {
      if (!value) {
        if (this.allowBlank()) {
          result.push(null);
          continue;
        } else {
          return null;
        }
      }

      const parsed = this.parse(value);
      // Give up if too many strings failed to parse or if the parsed value changes when converted back to text
      if (typeof parsed === "string" && ++unparsed > maxUnparsed || formatter.formatAny(parsed) !== value) {
        return null;
      }
      result.push(parsed);
    }
    return {values: result, colInfo};
  }

  /**
   * Whether this type of column can store nulls directly.
   */
  protected allowBlank(): boolean {
    return true;
  }
}

class BoolGuesser extends ValueGuesser<boolean> {
  public colInfo(): GuessedColInfo {
    return {type: 'Bool'};
  }

  public parse(value: string): boolean | string {
    if (value === "true") {
      return true;
    } else if (value === "false") {
      return false;
    } else {
      return value;
    }
  }

  /**
   * This is the only type that can't store nulls, it converts them to false.
   */
  protected allowBlank(): boolean {
    return false;
  }
}

class NumericGuesser extends ValueGuesser<number> {
  private _parser: ValueParser;
  constructor(docSettings: DocumentSettings, private _options: NumberFormatOptions) {
    super();
    this._parser = createParserRaw('Numeric', _options, docSettings);
  }

  public colInfo(): GuessedColInfo {
    const result: GuessedColInfo = {type: 'Numeric'};
    if (Object.keys(this._options).length) {
      result.widgetOptions = this._options;
    }
    return result;
  }

  public parse(value: string): number | string {
    return this._parser.cleanParse(value);
  }
}

class DateGuesser extends ValueGuesser<number> {
  // _format should be a full moment format string
  // _tz should be the document's default timezone
  constructor(private _format: string, private _tz: string) {
    super();
  }

  public colInfo(): GuessedColInfo {
    const widgetOptions = dateTimeWidgetOptions(this._format, false);
    let type;
    if (widgetOptions.timeFormat) {
      type = 'DateTime:' + this._tz;
    } else {
      type = 'Date';
      this._tz = "UTC";
    }
    return {widgetOptions, type};
  }

  // Note that this parsing is much stricter than parseDate to prevent loss of information.
  // Dates which can be parsed by parseDate based on the guessed widget options may not be parsed here.
  public parse(value: string): number | string {
    const m = moment.tz(value, this._format, true, this._tz);
    return m.isValid() ? m.valueOf() / 1000 : value;
  }
}

export function guessColInfoWithDocData(values: Array<string | null>, docData: DocData) {
  return guessColInfo(values, docData.docSettings(), docData.docInfo().timezone);
}

export function guessColInfo(
  values: Array<string | null>, docSettings: DocumentSettings, timezone: string
): GuessResult {
  // Use short-circuiting of || to only do as much work as needed,
  // in particular not guessing date formats before trying other types.
  return (
    new BoolGuesser()
      .guess(values, docSettings) ||
    new NumericGuesser(
      docSettings,
      NumberParse.fromSettings(docSettings).guessOptions(values)
    )
      .guess(values, docSettings) ||
    new DateGuesser(guessDateFormat(values, timezone), timezone)
      .guess(values, docSettings) ||
    // Don't return the same values back if there's no conversion to be done,
    // as they have to be serialized and transferred over a pipe to Python.
    {colInfo: {type: 'Text'}}
  );
}
